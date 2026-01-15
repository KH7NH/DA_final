import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../api/axios";

const initialState = {
  messages: [],
};

export const fetchMessages = createAsyncThunk(
  "messages/fetchMessages",
  async ({ token, userId }) => {
    const { data } = await api.post(
      "/api/message/get",
      { to_user_id: userId },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return data.success ? data : null;
  }
);

const messagesSlice = createSlice({
  name: "messages",
  initialState,
  reducers: {
    setMessages: (state, action) => {
      state.messages = action.payload;
    },

    // ✅ FIX: chống duplicate theo _id
    addMessage: (state, action) => {
      const msg = action.payload;
      const id = msg?._id;

      if (id) {
        const exists = state.messages.some((m) => String(m?._id) === String(id));
        if (exists) return;
      }

      state.messages.push(msg);
    },

    resetMessages: (state) => {
      state.messages = [];
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchMessages.fulfilled, (state, action) => {
      if (action.payload) {
        state.messages = action.payload.messages;
      }
    });
  },
});

export const { setMessages, addMessage, resetMessages } = messagesSlice.actions;
export default messagesSlice.reducer;
