import mongoose from 'mongoose';

const batchSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  seedType: {
    type: Number,
    required: true
  },
  outputCount: {
    type: Number,
    required: true
  },
  potsDoneCount: {
    type: Number,
    required: true,
    default: 0
  },
  status: {
    type: String,
    required: true,
    enum: ['Ongoing', 'Paused', 'Finished', 'Cancelled'], 
    default: 'Ongoing'
  },
}, { timestamps: true });

const Batch = mongoose.model('Batch', batchSchema);

export default Batch;
