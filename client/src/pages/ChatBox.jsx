import React, { useEffect, useRef, useState } from "react";
import { ImageIcon, SendHorizonal } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import api from "../api/axios";
import { addMessage, fetchMessages, resetMessages } from "../features/messages/messagesSlice";
import toast from "react-hot-toast";

const ChatBox = () => {
  const { messages } = useSelector((state) => state.messages);
  const connections = useSelector((state) => state.connections.connections);

  // ✅ mongo user hiện tại (bạn đang dùng state.user.value ở các chỗ khác)
  const currentUser = useSelector((state) => state.user.value);

  const { userId } = useParams(); // ObjectId of friend
  const { getToken } = useAuth();
  const dispatch = useDispatch();

  const [text, setText] = useState("");
  const [image, setImage] = useState(null);

  // ✅ preview url
  const [imagePreview, setImagePreview] = useState(null);

  const [user, setUser] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  /* ================= FETCH MESSAGES ================= */
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const token = await getToken();
        dispatch(fetchMessages({ token, userId }));
      } catch (err) {
        toast.error(err.message);
      }
    };

    loadMessages();

    return () => {
      dispatch(resetMessages());
    };
  }, [userId, getToken, dispatch]);

  /* ================= FIND USER ================= */
  useEffect(() => {
    if (connections?.length) {
      const found = connections.find((u) => u._id === userId);
      setUser(found || null);
    }
  }, [connections, userId]);

  /* ================= AUTO SCROLL ================= */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ================= CLEANUP PREVIEW URL ================= */
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ================= PICK IMAGE ================= */
  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // cleanup preview cũ
    if (imagePreview) URL.revokeObjectURL(imagePreview);

    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  /* ================= SEND MESSAGE ================= */
  const sendMessage = async () => {
    try {
      if (!text && !image) return;

      const token = await getToken();
      const formData = new FormData();
      formData.append("to_user_id", userId);
      formData.append("text", text);
      if (image) formData.append("image", image);

      const { data } = await api.post("/api/message/send", formData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!data.success) throw new Error(data.message);

      setText("");
      clearImage();
      dispatch(addMessage(data.message));
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  if (!user) return null;

  return (
    <div className="flex flex-col h-screen">
      {/* HEADER */}
      <div className="flex items-center gap-2 p-3 border-b bg-slate-50">
        <img src={user.profile_picture} className="size-8 rounded-full" alt="" />
        <div>
          <p className="font-medium">{user.full_name}</p>
          <p className="text-xs text-gray-500">@{user.username}</p>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="space-y-3 max-w-4xl mx-auto">
          {messages.map((msg, i) => {
            const fromId = msg.from_user_id?._id || msg.from_user_id;
            const myId = currentUser?._id;

            // ✅ isMine = tin nhắn do mình gửi
            const isMine = myId && String(fromId) === String(myId);

            return (
              <div key={msg._id || i} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`p-2 rounded-lg shadow max-w-sm text-sm ${
                    isMine ? "bg-indigo-100 rounded-br-none" : "bg-white rounded-bl-none"
                  }`}
                >
                  {msg.message_type === "image" && msg.media_url && (
                    <img src={msg.media_url} className="rounded mb-1 max-w-[260px]" alt="" />
                  )}
                  {msg.text && <p>{msg.text}</p>}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* INPUT */}
      <div className="p-3 border-t bg-white">
        <div className="max-w-xl mx-auto">
          {/* ✅ IMAGE PREVIEW */}
          {imagePreview && (
            <div className="mb-2 relative w-fit">
              <img src={imagePreview} alt="preview" className="max-h-40 rounded-lg border" />
              <button
                type="button"
                onClick={clearImage}
                className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center"
                title="Remove"
              >
                ×
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              className="flex-1 border rounded-full px-4 py-2"
              placeholder="Type a message..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />

            <label>
              <ImageIcon className="size-6 text-gray-400 cursor-pointer" />
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept="image/*"
                onChange={onPickImage}
              />
            </label>

            <button onClick={sendMessage} className="bg-indigo-600 text-white p-2 rounded-full">
              <SendHorizonal size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatBox;
