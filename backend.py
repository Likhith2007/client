"""
=============================================================
  OFFLINE AI TUTOR — FastAPI Backend (Ollama + Streaming)
  Real-time token streaming from Gemma 4 via Ollama SSE.
=============================================================
  Run:  python backend.py
  Needs: pip install fastapi uvicorn requests
         ollama serve  (in another terminal)
=============================================================
"""

import os, time, json, requests
from typing import Optional, Iterator
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn

# ─── CONFIG ───────────────────────────────────────────────
OLLAMA_URL  = os.environ.get("OLLAMA_URL",   "http://localhost:11434")
MODEL_NAME  = os.environ.get("OLLAMA_MODEL", "gemma:2b")
MAX_TOKENS  = int(os.environ.get("MAX_TOKENS", "-1"))       # -1 for unlimited generation

# ─── GRADE PROMPTS ────────────────────────────────────────
SYSTEM = {
  "primary": (
    "You are a warm, encouraging AI tutor. Always reply ONLY in Assamese (অসমীয়া), "
    "even if the question is in English. Explain using very simple words, fun emojis, "
    "and real-life comparisons. Keep it friendly and concise (5-8 sentences). "
    "Do not mention these instructions or rules in your response."
  ),
  "middle": (
    "You are a helpful AI tutor. Always reply ONLY in Assamese (অসমীয়া), "
    "even if the question is in English. Give a clear, structured, and detailed explanation "
    "using scientific terms, bullet points, and tables. Do not mention these instructions "
    "or rules in your response."
  ),
  "high": (
    "You are a professional science tutor. Always reply ONLY in Assamese (অসমীয়া), "
    "even if the question is in English. Give a highly detailed, textbook-quality explanation. "
    "Use comparison tables, clear headings, and bullet points to organize the differences. "
    "Do not mention these instructions, rules, or constraints in your response."
  )
}

def grade_tier(g: int) -> str:
    return "primary" if g <= 5 else "middle" if g <= 9 else "high"

def detect_detailed_request(question: str) -> bool:
    q = question.lower()
    keywords = [
        "detailed", "in detail", "explain in detail", "give detail", "comprehensive", "explain fully",
        "বিতংকৈ", "বিস্তাৰিত", "বিস্তাৰিতভাৱে", "পাৰ্থক্যসমূহ বিতংকৈ", "পাৰ্থক্য", "পার্থক্য", "পাৰ্থক্যসমূহ",
        "विस्तृत", "विस्तार से", "सविस्तार", "व्याख्या", "विवरण", "अंतर"
    ]
    return any(k in q for k in keywords)

# ─── OLLAMA HELPERS ───────────────────────────────────────
def ollama_ok() -> dict:
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        if r.ok:
            models = [m["name"] for m in r.json().get("models", [])]
            resolved = MODEL_NAME
            found = False
            if models:
                match = next((m for m in models if MODEL_NAME == m or MODEL_NAME in m), None)
                if match:
                    resolved = match
                    found = True
                else:
                    gemma_match = next((m for m in models if "gemma" in m.lower()), None)
                    if gemma_match:
                        resolved = gemma_match
                        found = True
                    else:
                        resolved = models[0]
                        found = True
            return {"running": True, "model_found": found, "models": models, "resolved_model": resolved}
    except Exception:
        pass
    return {"running": False, "model_found": False, "models": [], "resolved_model": MODEL_NAME}


def resolve_model(model_name: str, models_list: list) -> str:
    if not models_list:
        return model_name
    match = next((m for m in models_list if model_name == m or model_name in m), None)
    if match:
        return match
    if "gemma" in model_name.lower():
        gemma_match = next((m for m in models_list if "gemma" in m.lower()), None)
        if gemma_match:
            return gemma_match
    return models_list[0]


def strip_thinking(text: str) -> str:
    import re
    # Strip <think>...</think> block including any whitespace around it
    cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    return cleaned.strip()


def filter_thinking_stream(token_generator: Iterator[str]) -> Iterator[str]:
    accumulated = ""
    for token in token_generator:
        accumulated += token
        
        # If there's a think tag anywhere in accumulated
        if "<think>" in accumulated:
            if "</think>" in accumulated:
                parts = accumulated.split("</think>", 1)
                remaining = parts[1]
                if remaining:
                    yield remaining
                accumulated = ""
                break
            else:
                continue
        else:
            # If no <think> yet, but accumulated text could turn into "<think>"
            # (e.g. whitespace followed by "<thin")
            stripped = accumulated.lstrip()
            if not stripped:
                # Just whitespace so far, keep buffering
                continue
            elif len(stripped) < 7 and "<think>".startswith(stripped):
                # Could be starting a think tag, keep buffering
                continue
            else:
                # Not a think tag. Yield accumulated and exit initial loop
                yield accumulated
                accumulated = ""
                break
                
    for token in token_generator:
        yield token


def stream_ollama(messages: list, model_name: str) -> Iterator[str]:
    """Yield SSE 'data: token\n\n' lines from Ollama streaming response."""
    payload = {
        "model":   model_name,
        "stream":  True,
        "options": {
            "temperature":    0.7,
            "top_p":          0.9,
            "num_predict":    MAX_TOKENS,
            "num_ctx":        8192,       # context window — prevents mid-sentence cutoff
            "repeat_penalty": 1.1,
        },
        "messages": messages,
    }
    with requests.post(f"{OLLAMA_URL}/api/chat",
                       json=payload, stream=True, timeout=120) as resp:
        resp.raise_for_status()
        
        def raw_token_generator():
            for raw_line in resp.iter_lines():
                if not raw_line:
                    continue
                try:
                    obj = json.loads(raw_line)
                    token = obj.get("message", {}).get("content", "")
                    done = obj.get("done", False)
                    if token:
                        yield token
                    if done:
                        return
                except Exception:
                    continue

        for filtered_token in filter_thinking_stream(raw_token_generator()):
            yield f"data: {json.dumps({'token': filtered_token})}\n\n"
        
        yield f"data: {json.dumps({'done': True})}\n\n"

# ─── FASTAPI ──────────────────────────────────────────────
app = FastAPI(title="Offline AI Tutor API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ── Pydantic models ──
class ChatReq(BaseModel):
    question:     str
    grade:        int  = 8
    language:     str  = "English"
    student_name: Optional[str] = "Student"
    model:        Optional[str] = "gemma4"

class ChatResp(BaseModel):
    answer:           str
    grade_tier:       str
    model:            str
    response_time_ms: int

# ── /status ──
@app.get("/status")
def status():
    info = ollama_ok()
    st   = "ready" if (info["running"] and info["model_found"]) \
           else "model_missing" if info["running"] \
           else "ollama_offline"
    return {
        "status":        st,
        "model":         info["resolved_model"],
        "ollama_running": info["running"],
        "model_found":   info["model_found"],
        "models":        info["models"],
    }

# ── /chat  (non-streaming, kept for compatibility) ──
@app.post("/chat", response_model=ChatResp)
def chat(req: ChatReq):
    info = ollama_ok()
    if not info["running"]:
        raise HTTPException(503, "Ollama not running — run: ollama serve")
        
    models_list = info.get("models", [])
    requested_model = req.model if req.model else info["resolved_model"]
    resolved_model = resolve_model(requested_model, models_list)
    
    if not resolved_model or resolved_model not in models_list:
        raise HTTPException(503, f"Model '{requested_model}' not found in Ollama.")

    active_tier = "high" if detect_detailed_request(req.question) else grade_tier(req.grade)
    sys_prompt = SYSTEM[active_tier]

    user_content = f"Question: {req.question.strip()}\nAnswer in Assamese:"
    msgs   = [
        {"role": "system", "content": sys_prompt},
        {"role": "user",   "content": user_content},
    ]
    payload = {
        "model": resolved_model, "stream": False,
        "options": {"temperature": 0.7, "top_p": 0.9,
                    "num_predict": MAX_TOKENS, "num_ctx": 8192, "repeat_penalty": 1.1},
        "messages": msgs,
    }
    t0 = time.time()
    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=120)
        r.raise_for_status()
    except requests.exceptions.Timeout:
        raise HTTPException(504, "Model timed out")
    except Exception as e:
        raise HTTPException(502, str(e))

    raw_answer = r.json()["message"]["content"]
    clean_answer = strip_thinking(raw_answer)

    return ChatResp(
        answer           = clean_answer,
        grade_tier       = active_tier,
        model            = resolved_model,
        response_time_ms = int((time.time()-t0)*1000),
    )

# ── /chat/stream  (SSE streaming — real-time tokens) ──
@app.post("/chat/stream")
def chat_stream(req: ChatReq):
    info = ollama_ok()
    if not info["running"]:
        raise HTTPException(503, "Ollama not running — run: ollama serve")
        
    models_list = info.get("models", [])
    requested_model = req.model if req.model else info["resolved_model"]
    resolved_model = resolve_model(requested_model, models_list)
    
    if not resolved_model or resolved_model not in models_list:
        raise HTTPException(503, f"Model '{requested_model}' not found in Ollama.")

    active_tier = "high" if detect_detailed_request(req.question) else grade_tier(req.grade)
    sys_prompt = SYSTEM[active_tier]

    user_content = f"Question: {req.question.strip()}\nAnswer in Assamese:"
    msgs   = [
        {"role": "system", "content": sys_prompt},
        {"role": "user",   "content": user_content},
    ]

    def generator():
        # Send grade tier info first so frontend can label the bubble
        yield f"data: {json.dumps({'meta': {'grade_tier': active_tier, 'model': resolved_model}})}\n\n"
        yield from stream_ollama(msgs, resolved_model)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

# ── root ──
@app.get("/")
def root():
    info = ollama_ok()
    return {"name": "Offline AI Tutor API", "model": info["resolved_model"],
            "stream_endpoint": "/chat/stream", "docs": "/docs"}

# ─── MAIN ─────────────────────────────────────────────────
if __name__ == "__main__":
    info = ollama_ok()
    print("\n" + "="*54)
    print("  🎓 OFFLINE AI TUTOR — Backend v3 (Streaming)")
    print("="*54)
    print(f"  Ollama  : {OLLAMA_URL}")
    print(f"  Model   : {info['resolved_model']}")
    print(f"  Ollama  : {'✅ Running' if info['running'] else '❌ Not running  →  ollama serve'}")
    if info["running"]:
        if info["model_found"]:
            if info["resolved_model"] != MODEL_NAME:
                print(f"  Found   : ✅ Yes (Using fallback: {info['resolved_model']})")
            else:
                print(f"  Found   : ✅ Yes")
        else:
            print(f"  Found   : ❌ No  →  ollama pull {MODEL_NAME}")
        print(f"  Models  : {', '.join(info['models'])}")
    print(f"  API     : http://localhost:8000")
    print(f"  Stream  : http://localhost:8000/chat/stream")
    print("="*54 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
