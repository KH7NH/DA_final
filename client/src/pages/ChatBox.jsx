import React, { useEffect, useMemo, useRef, useState } from "react";
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

  // Mongo user hiện tại
  const currentUser = useSelector((state) => state.user.value);

  const { userId } = useParams(); // ObjectId of friend
  const { getToken } = useAuth();
  const dispatch = useDispatch();

  const [text, setText] = useState("");
  const [image, setImage] = useState(null);

  const [imagePreview, setImagePreview] = useState(null);
  const [user, setUser] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // dùng để tránh add trùng khi SSE echo lại message mình vừa gửi
  const lastAddedIdRef = useRef(null);

  const meId = useMemo(() => String(currentUser?._id || ""), [currentUser?._id]);
  const friendId = useMemo(() => String(userId || ""), [userId]);

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

  /* ================= SSE REALTIME ================= */
  useEffect(() => {
    // chỉ connect khi đã có mongo _id
    if (!meId) return;

    const sseUrl = `${import.meta.env.VITE_BASEURL}/api/message/sse/${meId}`;
    const es = new EventSource(sseUrl);

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        const fromId = String(msg?.from_user_id?._id || msg?.from_user_id || "");
        const toId = String(msg?.to_user_id?._id || msg?.to_user_id || "");

        // chỉ add nếu message thuộc cuộc chat đang mở
        const belongsToThisChat =
          (fromId === meId && toId === friendId) ||
          (fromId === friendId && toId === meId);

        if (!belongsToThisChat) return;

        // tránh add trùng theo _id
        const msgId = String(msg?._id || "");
        if (msgId && lastAddedIdRef.current === msgId) return;

        // cũng tránh trùng nếu state đã có message id đó rồi
        // (nhẹ nhàng: check nhanh last message)
        const last = messages[messages.length - 1];
        const lastId = String(last?._id || "");
        if (msgId && lastId === msgId) return;

        lastAddedIdRef.current = msgId || null;
        dispatch(addMessage(msg));
      } catch {
        // ignore parse errors
      }
    };

    es.addEventListener("connected", () => {});
    es.addEventListener("ping", () => {});

    es.onerror = () => {
      // SSE tự reconnect; không close để nó tự nối lại
    };

    return () => {
      es.close();
    };
    // ⚠️ friendId thay đổi khi bạn chuyển cuộc chat -> filter chat đúng
    // messages đưa vào deps sẽ khiến reconnect liên tục -> không nên
  }, [meId, friendId, dispatch]); // không để messages vào deps

  /* ================= PICK IMAGE ================= */
  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

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
      if (image) formData.append("image", image); // ✅ field name phải là "image"

      const { data } = await api.post("/api/message/send", formData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!data?.success) throw new Error(data?.message || "Send failed");

      // tránh SSE echo add trùng: lưu id vừa gửi
      const sent = data.message;
      if (sent?._id) lastAddedIdRef.current = String(sent._id);

      setText("");
      clearImage();

    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);

      // nếu bị chặn ảnh nhạy cảm, clear luôn ảnh để chọn lại
      const status = err?.response?.status;
      if (status === 400 && image) {
        clearImage();
      }
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

            const isMine = myId && String(fromId) === String(myId);

            return (
              <div
                key={msg._id || i}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`p-2 rounded-lg shadow max-w-sm text-sm ${
                    isMine ? "bg-indigo-100 rounded-br-none" : "bg-white rounded-bl-none"
                  }`}
                >
                  {msg.message_type === "image" && msg.media_url && (
                    <img
                      src={msg.media_url}
                      className="rounded mb-1 max-w-[260px]"
                      alt=""
                    />
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
