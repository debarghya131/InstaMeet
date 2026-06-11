import mongoose, { Schema } from "mongoose";

const WebsiteStatsSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

const WebsiteStats =
  mongoose.models.WebsiteStats ||
  mongoose.model("WebsiteStats", WebsiteStatsSchema);

export default WebsiteStats;
