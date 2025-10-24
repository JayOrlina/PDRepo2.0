import mongoose from 'mongoose';

const machineStateSchema = new mongoose.Schema({
    systemName: {
        type: String,
        default: 'main',
        unique: true
    },
    soilLevel: {
        type: Number,
        enum: [0, 1], // 0 = Low, 1 = Sufficient
        default: 1
    },
    cupLevel: {
        type: Number,
        enum: [0, 1], // 0 = Low, 1 = Sufficient
        default: 1
    },
    activeBatchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Batch',
        default: null
    }
}, { timestamps: true });

const MachineState = mongoose.model('machineState', machineStateSchema);

export default MachineState;
