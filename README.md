# Offline AI Tutor — Assamese Edition 🎓

An intelligent, offline educational tutor utilizing locally deployed Large Language Models (LLMs) to provide personalized learning. This edition is **locked to Assamese (অসমীয়া)** by default to support regional medium learning, even when queries are submitted in English.

---

## 📋 System Requirements

* **Operating System**: Windows 10/11, macOS, or Linux.
* **Python**: Version 3.8 or higher.
* **Ollama**: Required to run the local LLM.
* **Hardware**: Minimum 8GB RAM (16GB recommended) and a dedicated GPU or multi-core CPU.

---

## 🚀 Setup Instructions

Follow these steps in order to set up the application on any new laptop:

### Step 1: Install Python and Ollama
1. **Python**: Download and install Python from the [official website](https://www.python.org/downloads/). 
   * *Important*: Make sure to check the box that says **"Add Python to PATH"** during installation.
2. **Ollama**: Download and install Ollama from [ollama.com](https://ollama.com). Run the app after installing (you will see an icon in your system tray).

### Step 2: Clone or Copy the Repository
Clone the repository or copy the project files to the laptop:
```bash
git clone https://github.com/Likhith2007/client.git
cd client
```

### Step 3: Install Python Dependencies
Open your terminal inside the project folder and run:
```bash
pip install -r requirements.txt
```
This installs the required libraries (FastAPI, Uvicorn, Requests, and Pydantic) listed in [requirements.txt](file:///c:/Users/ilikh/Downloads/new/requirements.txt).

### Step 4: Download the Local AI Model
Ensure Ollama is running, then download the model by running the following command in your terminal:
```bash
ollama pull gemma2:2b
```

### Step 5: Start the Tutor Backend
Run the backend server using Python:
```bash
python backend.py
```
Leave this terminal window open. If successful, you will see a console printout showing:
```text
======================================================
  🎓 OFFLINE AI TUTOR — Backend v3 (Streaming)
======================================================
  Ollama  : http://localhost:11434
  Model   : gemma2:2b
  Ollama  : ✅ Running
  Found   : ✅ Yes
...
```

### Step 6: Start the Frontend (Website)
While you can double-click [index.html](file:///c:/Users/ilikh/Downloads/new/index.html) to open it, browsers sometimes block local API requests due to security/CORS restrictions. **Running a local web server is highly recommended**:

1. Open a **new terminal window** in the project folder.
2. Start Python's built-in server:
   ```bash
   python -m http.server 3000
   ```
3. Open your browser and navigate to: **`http://localhost:3000`**

---

## 🛠️ Troubleshooting

### 1. "python is not recognized as an internal or external command"
* **Cause**: Python is not installed, or it wasn't added to your system's PATH.
* **Fix**: Re-run the Python installer, select **Modify**, and check **Add Python to PATH**. Alternatively, manually add your Python installation directory to your system environment variables.

### 2. The `__pycache__` folder was not created after running the backend
* **Cause**: The backend script crashed or failed to start before compiling modules.
* **Fix**: Look closely at the terminal output for errors:
  - If it mentions a `ModuleNotFoundError`, run `pip install -r requirements.txt` again.
  - If it mentions port binding errors, another program is using port `8000`. Open [backend.py](file:///c:/Users/ilikh/Downloads/new/backend.py), change `port=8000` to `port=8080` in the last line, and change `const API_BASE = 'http://localhost:8000';` in [app.js](file:///c:/Users/ilikh/Downloads/new/app.js) to `http://localhost:8080`.

### 3. Website shows "Backend Offline"
* Check if Ollama is running by visiting `http://localhost:11434` in your browser. It should say `"Ollama is running"`.
* Make sure `python backend.py` is running and has not crashed.
* Ensure you are hosting the frontend via Python's HTTP server (Step 6) instead of opening the file directly.
