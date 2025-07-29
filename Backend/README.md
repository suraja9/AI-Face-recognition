# 🧠 Face Recognition Attendance System (Backend)

This is the backend for an AI-based attendance system using facial recognition, anti-spoofing, and Firebase integration. It is built with Python, Flask, and several ML models for robust real-time attendance tracking.

---

## 🚀 Features

- 🔍 Face Recognition & Blink Detection
- 🛡️ Anti-Spoofing with eye blink detection
- 🔐 Firebase Integration for real-time data sync
- 📦 Render-ready deployment (Flask-based API)

---

## 🗂️ Folder Structure

```
Backend/
├── anti_spoof_detection.py
├── attendance_prediction.py
├── blink_detection.py
├── config.py
├── face_recognition_utils.py
├── firebase_integration.py
├── main.py
├── registration.py
├── server.py                # Flask entry point
├── attendance_prediction_model.pkl
├── label_encoders.pkl
├── shape_predictor_68_face_landmarks.dat
├── firebase_config/
│   └── service-account.json  # 🔒 Firebase admin credentials
├── requirements.txt
├── Procfile
├── .render.yaml
├── .gitignore
```

---

## ⚙️ Installation (Local Setup)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/your-repo.git
cd your-repo/Backend
```

### 2. Create Virtual Environment

```bash
python -m venv venv
source venv/bin/activate   # Linux/Mac
venv\Scripts\activate      # Windows
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

---

## ▶️ Run the Server Locally

```bash
python server.py
```

> The server will run on `http://localhost:5000/`

---

## ☁️ Deployment on Render

### 1. Requirements

Make sure you have the following in the root of `Backend/`:
- `Procfile`
- `requirements.txt`
- `.render.yaml` *(optional but recommended)*

### 2. Deploy Steps

- Push this project to a **GitHub repo**
- Go to [Render](https://render.com)
- Create a **New Web Service**
- Connect your repo
- Set `Build Command` and `Start Command` automatically via `.render.yaml` or manually:
  ```bash
  pip install -r requirements.txt
  python server.py
  ```

---

## 🔐 Environment Setup

Put your **Firebase service account JSON** inside `firebase_config/`. Do **not** upload it to public repos. You can load it using:

```python
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://your-project-id.firebaseio.com'
})
```

Alternatively, set the path as an environment variable (`GOOGLE_APPLICATION_CREDENTIALS`) on Render.

---

## 🛑 Do Not Commit These Files

Make sure your `.gitignore` includes:

```gitignore
__pycache__/
*.pyc
*.pkl
*.whl
*.dat
*.json
.env
```

---

## 📞 API Endpoints (Optional Section)

You can document your Flask endpoints here, e.g.:

- `POST /register`
- `POST /verify`
- `GET /status`

(Add this if you have public APIs you want to expose)

---

## 📬 Contact

Built by [Your Name] – feel free to [email/contact/linkedin here].
