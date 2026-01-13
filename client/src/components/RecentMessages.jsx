import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import moment from "moment";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useSelector } from "react-redux";
import api from "../api/axios";
import toast from "react-hot-toast";

const RecentMessages = () => {
  const [messages, setMessages] = useState([]);
  const { user } = useUser();
  const { getToken } = useAuth();

  // ✅ Mongo user hiện tại (theo code bạn đã dùng ở PostCard)
  const currentUser = useSelector((state) => state.user.value);
  const myId = currentUser?._id ? String(currentUser._id) : null;

  const fetchRecentMessages = async () => {
    try {
      const token = await getToken();
      const { data } = await api.get("/api/message/recent", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (data.success) {
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  useEffect(() => {
    if (!user) return;

    fetchRecentMessages();
    const intervalId = setInterval(fetchRecentMessages, 30000);

    return () => clearInterval(intervalId);
  }, [user]);

  return (
    <div className="bg-white max-w-xs mt-4 p-4 min-h-20 rounded-md shadow text-xs text-slate-800">
      <h3 className="font-semibold text-slate-8 mb-4">Recent Messages</h3>

      <div className="flex flex-col max-h-56 overflow-y-scroll no-scrollbar">
        {messages.map((message, index) => {
          const fromId = String(message.from_user_id?._id || message.from_user_id || "");
          const toId = String(message.to_user_id?._id || message.to_user_id || "");

          // ✅ chỉ hiện badge nếu là tin NHẬN (to = mình) và chưa seen
          const isIncoming = myId && toId === myId;
          const showBadge = isIncoming && message.seen === false;

          // ✅ đối phương để link vào chat (thường backend recent đã set from_user_id là đối phương)
          const partnerId = fromId;

          return (
            <Link
              to={`/messages/${partnerId}`}
              key={message._id || index}
              className="flex items-start gap-2 py-2 hover:bg-slate-100"
            >
              <img
                src={message.from_user_id?.profile_picture}
                alt=""
                className="w-8 h-8 rounded-full"
              />

              <div className="w-full">
                <div className="flex justify-between">
                  <p className="font-medium">{message.from_user_id?.full_name}</p>
                  <p className="text-[10px] text-slate-400">
                    {moment(message.createdAt).fromNow()}
                  </p>
                </div>

                <div className="flex justify-between">
                  <p className="text-gray-500">
                    {message.text ? message.text : "Media"}
                  </p>

                  {showBadge && (
                    <p className="bg-[oklch(14.1%_0.005_285.823)] text-white w-4 h-4 flex items-center justify-center rounded-full text-[10px]">
                      1
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default RecentMessages;
