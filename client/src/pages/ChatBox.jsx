import React, { useEffect, useRef, useState } from "react";
import { ImageIcon, SendHorizonal } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import api from "../api/axios";
import {
  addMessage,
  fetchMessages,
  resetMessages,
} from "../features/messages/messagesSlice";
import toast from "react-hot-toast";

const ChatBox = () => {
  const { messages } = useSelector((state) => state.messages);
  const connections = useSelector((state) => state.connections.connections);

  const { userId } = useParams(); // ObjectId of friend
  const { getToken, userId: clerkId } = useAuth();
  const dispatch = useDispatch();

  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [user, setUser] = useState(null);

  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  /* ================= FETCH MESSAGES ================= */
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const token = await getToken();
        dispatch(fetchMessages({ token, to_user_id: userId }));
      } catch (err) {
        toast.error(err.message);
      }
    };

    loadMessages();

    return () => {
      dispatch(resetMessages());
    };
  }, [userId]);

  /* ================= FIND USER ================= */
  useEffect(() => {
    if (connections.length) {
      const found = connections.find((u) => u._id === userId);
      setUser(found);
    }
  }, [connections, userId]);

  /* ================= SSE REALTIME ================= */
  useEffect(() => {
    if (!user) return;

    const es = new EventSource(
      `${import.meta.env.VITE_API_URL}/api/message/sse/${userId}`
    );

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      dispatch(addMessage(data));
    };

    es.onerror = () => es.close();
    eventSourceRef.current = es;

    return () => es.close();
  }, [userId]);

  /* ================= AUTO SCROLL ================= */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ================= SEND MESSAGE ================= */
  const sendMessage = async () => {
    try {
      if (!text && !image) return;

      const token = await getToken();
      const formData = new FormData();
      formData.append("to_user_id", userId);
      formData.append("text", text);
      image && formData.append("image", image);

      const { data } = await api.post("/api/message/send", formData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!data.success) throw new Error(data.message);

      setText("");
      setImage(null);
      dispatch(addMessage(data.message));
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (!user) return null;

  return (
    <div className="flex flex-col h-screen">
      {/* HEADER */}
      <div className="flex items-center gap-2 p-3 border-b bg-slate-50">
        <img src={user.profile_picture} className="size-8 rounded-full" />
        <div>
          <p className="font-medium">{user.full_name}</p>
          <p className="text-xs text-gray-500">@{user.username}</p>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="space-y-3 max-w-4xl mx-auto">
          {messages.map((msg, i) => {
            const isMine = msg.from_user_id._id !== user._id;

            return (
              <div
                key={i}
                className={`flex ${isMine ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`p-2 rounded-lg shadow max-w-sm text-sm ${
                    isMine
                      ? "bg-white rounded-bl-none"
                      : "bg-indigo-100 rounded-br-none"
                  }`}
                >
                  {msg.message_type === "image" && (
                    <img
                      src={msg.media_url}
                      className="rounded mb-1"
                      alt=""
                    />
                  )}
                  <p>{msg.text}</p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* INPUT */}
      <div className="p-3 border-t bg-white">
        <div className="flex items-center gap-3 max-w-xl mx-auto">
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
              type="file"
              hidden
              accept="image/*"
              onChange={(e) => setImage(e.target.files[0])}
            />
          </label>

          <button
            onClick={sendMessage}
            className="bg-indigo-600 text-white p-2 rounded-full"
          >
            <SendHorizonal size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatBox;
