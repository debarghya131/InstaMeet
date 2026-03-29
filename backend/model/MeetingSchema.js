import mongoose, { Schema } from "mongoose";

const MeetingSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    meetingCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Meeting =
  mongoose.models.Meeting || mongoose.model("Meeting", MeetingSchema);

export default Meeting;
