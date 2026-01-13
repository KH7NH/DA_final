import React, { useEffect, useRef } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import Feed from "./pages/Feed";
import Messages from "./pages/Messages";
import ChatBox from "./pages/ChatBox";
import Connections from "./pages/Connections";
import Discover from "./pages/Discover";
import Profile from "./pages/Profile";
import CreatePost from "./pages/CreatePost";
import { useUser, useAuth } from "@clerk/clerk-react";
import Layout from "./pages/Layout";
import toast, { Toaster } from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { fetchUser } from "./features/user/userSlice";
import { fetchConnections } from "./features/connections/connectionsSlice";
import { addMessage } from "./features/messages/messagesSlice";
import Notification from "./components/Notification";

const App = () => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { pathname } = useLocation();
  const pathnameRef = useRef(pathname);

  const dispatch = useDispatch();

  // ✅ Mongo user trong DB (đúng theo code bạn đã dùng ở PostCard.jsx)
  const mongoUser = useSelector((state) => state.user.value);

  /* ================= FETCH USER + CONNECTIONS ================= */
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      const token = await getToken();
      dispatch(fetchUser(token));
      dispatch(fetchConnections(token));
    };

    fetchData();
  }, [user, getToken, dispatch]);

  /* ================= KEEP CURRENT PATH ================= */
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  /* ================= SSE REALTIME (RECEIVE MESSAGES) ================= */
  useEffect(() => {
    // cần có user Clerk + mongoUser._id
    if (!user || !mongoUser?._id) return;

    const baseUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BASEURL;
    const sseUrl = `${baseUrl}/api/message/sse/${mongoUser._id}`;

    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      const message = JSON.parse(event.data);

      const myId = String(mongoUser._id);
      const fromId = String(message.from_user_id?._id || message.from_user_id);
      const toId = String(message.to_user_id?._id || message.to_user_id);

      // ✅ 1) Bỏ qua tin nhắn do chính mình gửi
      if (fromId === myId) return;

      // ✅ 2) Chỉ xử lý tin nhắn gửi tới mình
      if (toId !== myId) return;

      // ✅ 3) Nếu đang ở đúng phòng chat => addMessage, không thì notification
      if (pathnameRef.current === "/messages/" + fromId) {
        dispatch(addMessage(message));
      } else {
        toast.custom((t) => <Notification t={t} message={message} />, {
          position: "bottom-right",
        });
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [user, mongoUser?._id, dispatch]);

  return (
    <>
      <Toaster />
      <Routes>
        <Route path="/" element={!user ? <Login /> : <Layout />}>
          <Route index element={<Feed />} />
          <Route path="messages" element={<Messages />} />
          <Route path="messages/:userId" element={<ChatBox />} />
          <Route path="connections" element={<Connections />} />
          <Route path="discover" element={<Discover />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/:profileId" element={<Profile />} />
          <Route path="create-post" element={<CreatePost />} />
        </Route>
      </Routes>
    </>
  );
};

export default App;
