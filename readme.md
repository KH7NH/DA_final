⚙️ Yêu cầu môi trường
Chung

Node.js >= 18

Python 3.10 – 3.11

MongoDB (local hoặc Atlas)

Backend / Frontend

npm hoặc yarn

AI Service

Python virtualenv

TensorFlow 2.15+

1️⃣ Cài đặt AI Service (BẮT BUỘC – chạy trước)
📁 Thư mục
DA_final/AI_service

🔧 Tạo môi trường Python
cd AI_service
python -m venv venv

Windows
venv\Scripts\activate

macOS / Linux
source venv/bin/activate

📦 Cài dependencies
pip install -r requirements.txt


⚠️ Đảm bảo trong models/ có:

efficientnet_b3_final.keras

nsfw_mobilenetv2_3class.h5

▶️ Chạy AI Service
venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8001


Kiểm tra:

http://localhost:8001/health
 → { "ok": true }

2️⃣ Cài đặt Backend (Server)
📁 Thư mục
DA_final/server

📦 Cài package
cd server
npm install

🔐 Tạo file .env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/da_final

# Clerk
CLERK_PUBLISHABLE_KEY=pk_****
CLERK_SECRET_KEY=sk_****

# ImageKit
IMAGEKIT_PUBLIC_KEY=****
IMAGEKIT_PRIVATE_KEY=****
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/xxxx

# AI Service
AI_SERVICE_URL=http://127.0.0.1:8001


⚠️ Rất quan trọng
Dùng 127.0.0.1 thay vì localhost để tránh lỗi ECONNREFUSED ::1

▶️ Chạy Backend
npm start


Server chạy tại:

http://localhost:4000

3️⃣ Cài đặt Frontend (Client)
📁 Thư mục
DA_final/client

📦 Cài package
cd client
npm install

🔐 Tạo file .env
VITE_API_URL=http://localhost:4000

VITE_CLERK_PUBLISHABLE_KEY=pk_****

▶️ Chạy Frontend
npm run dev
