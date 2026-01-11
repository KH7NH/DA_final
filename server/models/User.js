import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    clerkId: {
      type: String,
      required: true,
      unique: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    full_name: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },

    bio: {
      type: String,
      default: 'Hey there! I am using PingUp.',
    },

    profile_picture: {
      type: String,
      default: '',
    },

    cover_photo: {
      type: String,
      default: '',
    },

    location: {
      type: String,
      default: '',
    },

    followers: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ],

    following: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ],

    connections: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
