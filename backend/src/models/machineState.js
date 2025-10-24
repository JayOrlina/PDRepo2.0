import mongoose from 'mongoose';

const machineStateSchema = new mongoose.Schema({
    // This 'systemName' is a trick to make sure we only ever have one document.
    // We will always findOne({ systemName: "main" })
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
    // This is the new, simpler way to check if a batch is active.
    // If it's null, no batch is active.
    activeBatchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Batch',
        default: null
    }
}, { timestamps: true });

const MachineState = mongoose.model('MachineState', machineStateSchema);

export default MachineState;