import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../api/axios.js";

const initialState = {
  value: null,
};

// Fetch user (giữ nguyên ý tưởng, thêm reject để debug dễ)
export const fetchUser = createAsyncThunk(
  "user/fetchUser",
  async (token, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/api/user/data", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!data?.success) {
        return rejectWithValue(data?.message || "Failed to fetch user");
      }

      return data.user;
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err.message);
    }
  }
);

// ✅ Update user: lỗi thì reject, thành công thì trả user
export const updateUser = createAsyncThunk(
  "user/update",
  async ({ userData, token }, { rejectWithValue }) => {
    try {
      const { data } = await api.post("/api/user/update", userData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!data?.success) {
        return rejectWithValue(data?.message || "Update failed");
      }

      return data.user;
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err.message);
    }
  }
);

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUser.fulfilled, (state, action) => {
        state.value = action.payload;
      })
      // fetch fail thì không xoá user
      .addCase(fetchUser.rejected, () => {
        // giữ nguyên state.value
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        // ✅ chỉ update khi thành công
        state.value = action.payload;
      })
      // update fail thì không xoá user
      .addCase(updateUser.rejected, () => {
        // giữ nguyên state.value
      });
  },
});

export default userSlice.reducer;
