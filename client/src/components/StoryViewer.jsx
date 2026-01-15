import { BadgeCheck, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { fixImageKitUrl } from "../utils/fixImageKitUrl";
import { useAuth } from "@clerk/clerk-react";
import api from "../api/axios";
import toast from "react-hot-toast";
import AgeVerifyModal from "./AgeVerifyModal";

const StoryViewer = ({ viewStory, setViewStory }) => {
  const { getToken } = useAuth();

  const [progress, setProgress] = useState(0);
  const [originalUrl, setOriginalUrl] = useState("");
  const [showVerify, setShowVerify] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);

  const displayMediaUrl = useMemo(() => {
    if (!viewStory) return "";
    // nếu đã reveal thì dùng originalUrl, không thì dùng media_url (blur)
    const url = originalUrl || viewStory.media_url;
    return fixImageKitUrl(url);
  }, [viewStory, originalUrl]);

  useEffect(() => {
    // reset reveal state khi đổi story
    setOriginalUrl("");
    setShowVerify(false);
    setRevealLoading(false);
  }, [viewStory?._id]);

  useEffect(() => {
    let timer, progressInterval;

    if (viewStory && viewStory.media_type !== "video") {
      setProgress(0);

      const duration = 10000;
      const setTime = 100;
      let elapsed = 0;

      progressInterval = setInterval(() => {
        elapsed += setTime;
        setProgress((elapsed / duration) * 100);
      }, setTime);

      timer = setTimeout(() => {
        setViewStory(null);
      }, duration);
    }

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
    };
  }, [viewStory, setViewStory]);

  const handleClose = () => setViewStory(null);

  if (!viewStory) return null;

  const isSensitiveImage = !!viewStory?.is_sensitive && viewStory.media_type === "image";
  const shouldCover = isSensitiveImage && !originalUrl;

  const handleReveal = async () => {
    try {
      setRevealLoading(true);
      const token = await getToken();
      const { data } = await api.post(
        "/api/story/reveal",
        { storyId: viewStory._id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.success && data?.original) {
        setOriginalUrl(data.original);
        return;
      }

      toast.error(data?.message || "Reveal failed");
    } catch (e) {
      const status = e?.response?.status;
      if (status === 403) {
        setShowVerify(true);
      } else {
        toast.error(e?.response?.data?.message || e.message);
      }
    } finally {
      setRevealLoading(false);
    }
  };

  const renderContent = () => {
    switch (viewStory.media_type) {
      case "image":
        return (
          <div className="relative">
            <img
              src={displayMediaUrl}
              alt=""
              className="max-w-full max-h-screen object-contain"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />

            {shouldCover && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm">
                <p className="text-white text-sm font-semibold">Sensitive content</p>
                <p className="text-white/80 text-xs px-6 text-center">
                  This story may contain NSFW or gore content.
                </p>

                <button
                  type="button"
                  onClick={handleReveal}
                  disabled={revealLoading}
                  className="px-4 py-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-100 disabled:opacity-70"
                >
                  {revealLoading ? "Loading..." : "Reveal"}
                </button>
              </div>
            )}
          </div>
        );

      case "video":
        return (
          <video
            onEnded={() => setViewStory(null)}
            src={displayMediaUrl}
            className="max-h-screen"
            controls
            autoPlay
          />
        );

      case "text":
        return (
          <div className="w-full h-full flex items-center justify-center p-8 text-white text-2xl text-center">
            {viewStory.content}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 h-screen bg-black bg-opacity-90 z-110 flex items-center justify-center"
        style={{
          backgroundColor:
            viewStory.media_type === "text" ? viewStory.background_color : "#000000",
        }}
      >
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gray-700">
          <div
            className="h-full bg-white transition-all duration-100 linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* User Info */}
        <div className="absolute top-4 left-4 flex items-center space-x-3 p-2 px-4 sm:p-4 sm:px-8 backdrop-blur-2xl rounded bg-black/50">
          <img
            src={fixImageKitUrl(viewStory.user?.profile_picture)}
            alt=""
            className="size-7 sm:size-8 rounded-full object-cover border border-white"
          />
          <div className="text-white font-medium flex items-center gap-1.5">
            <span>{viewStory.user?.full_name}</span>
            <BadgeCheck size={18} />
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-white text-3xl font-bold focus:outline-none"
        >
          <X className="w-8 h-8 hover:scale-110 transition cursor-pointer" />
        </button>

        {/* Content */}
        <div className="max-w-[90vw] max-h-[90vh] flex items-center justify-center">
          {renderContent()}
        </div>
      </div>

      <AgeVerifyModal
        open={showVerify}
        onClose={() => setShowVerify(false)}
        onVerified={() => {
          // verified xong → auto reveal lại
          handleReveal();
        }}
      />
    </>
  );
};

export default StoryViewer;
