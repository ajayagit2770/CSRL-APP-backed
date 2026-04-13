import mongoose from 'mongoose';

const ProfileSchema = new mongoose.Schema({
  ROLL_KEY: { type: String, required: true },
  centerCode: { type: String, required: true }
}, { strict: false, timestamps: true });

ProfileSchema.index({ centerCode: 1, ROLL_KEY: 1 }, { unique: true });

export default mongoose.models.Profile || mongoose.model('Profile', ProfileSchema);
