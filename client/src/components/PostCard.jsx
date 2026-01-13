import React, { useMemo, useState } from "react";
import { BadgeCheck, Heart, MessageCircle, Share2 } from "lucide-react";
import moment from "moment";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useAuth } from "@clerk/clerk-react";
import api from "../api/axios";
import toast from "react-hot-toast";
import { fixImageKitUrl } from "../utils/fixImageKitUrl";

const PostCard = ({ post }) => {
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const currentUser = useSelector((state) => state.user.value);
  const [likes, setLikes] = useState(post.likes_count || []);

  // Overlay che ảnh nhạy cảm (chỉ che UI, vì ảnh của bạn đã blur từ backend)
  const [revealSensitive, setRevealSensitive] = useState(false);

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

  const isSensitive = !!post?.is_sensitive;
  const shouldCover = isSensitive && !revealSensitive;

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-4 w-full max-w-2xl">
      {/* User Info */}
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

      {/* Content */}
      {post?.content && (
        <div
          className="text-gray-800 text-sm whitespace-pre-line"
          dangerouslySetInnerHTML={{ __html: postWithHashtags }}
        />
      )}

      {/* Images */}
      {!!post?.image_urls?.length && (
        <div className="grid grid-cols-2 gap-2">
          {post.image_urls.map((img, index) => {
            const isSingle = post.image_urls.length === 1;

            return (
              <div
                key={index}
                className={`relative overflow-hidden rounded-lg ${
                  isSingle ? "col-span-2" : ""
                }`}
              >
                <img
                  src={fixImageKitUrl(img)}
                  alt=""
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`w-full object-cover ${
                    isSingle ? "h-auto" : "h-48"
                  }`}
                />

                {/* Overlay cảnh báo nếu nhạy cảm */}
                {shouldCover && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm">
                    <p className="text-white text-sm font-semibold">
                      Sensitive content
                    </p>
                    <p className="text-white/80 text-xs px-6 text-center">
                      This post may contain NSFW or gore content.
                    </p>

                    <button
                      type="button"
                      onClick={() => setRevealSensitive(true)}
                      className="px-4 py-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-100"
                    >
                      I understand
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
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
  );
};

export default PostCard;
