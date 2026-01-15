import React, { useMemo, useState, useCallback } from "react";
import { BadgeCheck, Heart, MessageCircle, Share2 } from "lucide-react";
import moment from "moment";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useAuth } from "@clerk/clerk-react";
import api from "../api/axios";
import toast from "react-hot-toast";
import { fixImageKitUrl } from "../utils/fixImageKitUrl";
import AgeVerifyModal from "./AgeVerifyModal";

const PostCard = ({ post }) => {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const currentUser = useSelector((state) => state.user.value);

  const [likes, setLikes] = useState(post.likes_count || []);
  const [displayUrls, setDisplayUrls] = useState(post.image_urls || []);
  const [revealed, setRevealed] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);
  const [showVerify, setShowVerify] = useState(false);

  const urlLooksBlurred = (url) => {
    if (!url || typeof url !== "string") return false;
    return (
      url.includes("tr:bl-") || // ✅ ImageKit shorthand blur (case của bạn)
      url.includes("bl-") ||
      url.includes("blur-") ||
      url.includes("blur:") ||
      url.includes("tr:blur") ||
      url.includes("tr=blur")
    );
  };

  const isImageSensitive = useCallback(
    (index) => {
      const m = post?.moderation?.[index];
      if (m && typeof m.is_sensitive === "boolean") return m.is_sensitive;
      return false;
    },
    [post?.moderation]
  );

  const hasAnySensitiveImage = useMemo(() => {
    const anyByModeration = (post?.moderation || []).some((m) => m?.is_sensitive);
    if (anyByModeration) return true;
    return (displayUrls || []).some((u) => urlLooksBlurred(u));
  }, [post?.moderation, displayUrls]);

  const postWithHashtags = useMemo(() => {
    const content = post?.content || "";
    return content.replace(
      /(#\w+)/g,
      '<span class="text-[oklch(14.1%_0.005_285.823)]">$1</span>'
    );
  }, [post?.content]);

  const handleLike = async () => {
    try {
      const { data } = await api.post(
        `/api/post/like`,
        { postId: post._id },
        { headers: { Authorization: `Bearer ${await getToken()}` } }
      );

      if (data.success) {
        toast.success(data.message);
        setLikes((prev) => {
          if (prev?.includes(currentUser?._id)) {
            return prev.filter((id) => id !== currentUser._id);
          }
          return [...(prev || []), currentUser._id];
        });
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  const handleReveal = async () => {
    if (!hasAnySensitiveImage) {
      setRevealed(true);
      return;
    }

    try {
      setRevealLoading(true);
      const token = await getToken();
      const { data } = await api.post(
        "/api/post/reveal",
        { postId: post._id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.success && Array.isArray(data?.originals)) {
        setDisplayUrls(data.originals);
        setRevealed(true);
        return;
      }

      toast.error(data?.message || "Reveal failed");
    } catch (e) {
      const status = e?.response?.status;
      if (status === 403) setShowVerify(true);
      else toast.error(e?.response?.data?.message || e.message);
    } finally {
      setRevealLoading(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow p-4 space-y-4 w-full max-w-2xl">
        <div
          onClick={() => navigate("/profile/" + post.user?._id)}
          className="inline-flex items-center gap-3 cursor-pointer"
        >
          <img
            src={fixImageKitUrl(post.user?.profile_picture)}
            alt=""
            className="w-10 h-10 rounded-full shadow"
          />
          <div>
            <div className="flex items-center space-x-1">
              <span>{post.user?.full_name}</span>
              <BadgeCheck className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-gray-500 text-sm">
              @{post.user?.username} • {moment(post.createdAt).fromNow()}
            </div>
          </div>
        </div>

        {post?.content && (
          <div
            className="text-gray-800 text-sm whitespace-pre-line"
            dangerouslySetInnerHTML={{ __html: postWithHashtags }}
          />
        )}

        {!!displayUrls?.length && (
          <div className="grid grid-cols-2 gap-2">
            {displayUrls.map((img, index) => {
              const isSingle = displayUrls.length === 1;

              // ✅ Fix: nếu moderation fail thì fallback blur detect (tr:bl-60)
              const coverThisImage =
                (isImageSensitive(index) || urlLooksBlurred(img)) && !revealed;

              return (
                <div
                  key={`${post._id}-${index}`}
                  className={`relative overflow-hidden rounded-lg ${
                    isSingle ? "col-span-2" : ""
                  }`}
                >
                  <img
                    src={fixImageKitUrl(img)}
                    alt=""
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`w-full object-cover ${isSingle ? "h-auto" : "h-48"}`}
                  />

                  {coverThisImage && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm">
                      <p className="text-white text-sm font-semibold">Sensitive content</p>
                      <p className="text-white/80 text-xs px-6 text-center">
                        This image may contain NSFW or gore content.
                      </p>

                      <button
                        type="button"
                        onClick={handleReveal}
                        disabled={revealLoading}
                        className="px-4 py-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-100 disabled:opacity-70"
                      >
                        {revealLoading ? "Loading..." : "I understand"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-4 text-gray-600 text-sm pt-2 border-t border-gray-300">
          <div className="flex items-center gap-1">
            <Heart
              className={`w-4 h-4 cursor-pointer ${
                likes?.includes(currentUser?._id) ? "text-red-500 fill-red-500" : ""
              }`}
              onClick={handleLike}
            />
            <span>{likes?.length || 0}</span>
          </div>

          <div className="flex items-center gap-1">
            <MessageCircle className="w-4 h-4" />
            <span>{12}</span>
          </div>

          <div className="flex items-center gap-1">
            <Share2 className="w-4 h-4" />
            <span>{7}</span>
          </div>
        </div>
      </div>

      <AgeVerifyModal
        open={showVerify}
        onClose={() => setShowVerify(false)}
        onVerified={() => handleReveal()}
      />
    </>
  );
};

export default PostCard;
