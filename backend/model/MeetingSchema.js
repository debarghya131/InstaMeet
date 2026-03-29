import { Schema } from "mongoose";

const MeetingSchema = new Schema({
  
    userId: {
        type: String,

    },
    meetingCode: {
        type: String,
        required: true,
    },
    Date: {
        type: Date,
        default: Date.now,
        required: true,
    }

    });

const Meeting = mongoose.model('Meeting', MeetingSchema);

export { Meeting };