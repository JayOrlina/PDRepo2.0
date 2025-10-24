import Batch from '../models/Batch.js';
import MachineState from '../models/machineState.js';
import axios from 'axios';

const HARDWARE_IP = "http://10.126.124.91"; // (Your ESP32's IP)

// --- HELPER FUNCTION ---
// This finds the one-and-only machine state document, or creates it if it doesn't exist.
async function getOrCreateMachineState() {
    let state = await MachineState.findOne({ systemName: 'main' });
    if (!state) {
        state = new MachineState();
        await state.save();
    }
    return state;
}

// --- NEW CONTROLLER ---
// A new endpoint for the frontend to get the global state
export async function getMachineState(req, res) {
    try {
        const state = await getOrCreateMachineState();
        res.status(200).json(state);
    } catch (error) {
        console.error("Error in getMachineState", error);
        res.status(500).json({ message: "Error fetching machine state" });
    }
}

// --- UPDATED CONTROLLER ---
export async function createBatch(req, res) {
    try {
        const { title, content, seedType, outputCount } = req.body;
        
        // 1. Get the current machine state
        const machineState = await getOrCreateMachineState();

        // 2. Check for blockers
        if (machineState.activeBatchId) {
            return res.status(400).json({ message: "A batch is already in progress." });
        }
        if (machineState.soilLevel === 0 || machineState.cupLevel === 0) {
            return res.status(400).json({ message: "Cannot start: Supplies are low." });
        }

        // 3. Create the batch
        const batch = new Batch({ title, content, seedType, outputCount });
        const savedBatch = await batch.save();

        // 4. Tell the hardware to start
        try {
            await axios.post(`${HARDWARE_IP}/start-batch`, {
                batchId: savedBatch._id
            }, { timeout: 2000 });
            console.log(`Successfully sent start command to hardware for batch: ${savedBatch._id}`);
        } catch (hwError) {
            console.error("CRITICAL: Failed to contact hardware.", hwError.message);
            // We'll continue even if hardware fails, the batch is created.
        }

        // 5. Update the machine state to show this batch is active
        machineState.activeBatchId = savedBatch._id;
        await machineState.save();
        
        res.status(201).json(savedBatch);

    } catch (error) {
        console.error("Error in createBatch controller", error);
        res.status(500).json({ message: "Error creating batch" });
    }
}

// This function now updates TWO models
export async function updateBatch(req, res) {
    try {
        const { potsIncrement, soilLevel, cupLevel } = req.body;
        
        // 1. Get both the batch and the machine state
        const batch = await Batch.findById(req.params.id);
        const machineState = await getOrCreateMachineState();

        if (!batch) {
            return res.status(404).json({ message: "Batch not found" });
        }

        if (batch.status === 'Finished' || batch.status === 'Cancelled') {
            return res.status(400).json({ message: "This batch is already complete." });
        }

        // 2. Update the correct model based on sensor data
        if (soilLevel !== undefined) machineState.soilLevel = soilLevel;
        if (cupLevel !== undefined) machineState.cupLevel = cupLevel;
        if (potsIncrement) batch.potsDoneCount += Number(potsIncrement);

        // 3. Run the new logic
        if (machineState.soilLevel === 0 || machineState.cupLevel === 0) {
            batch.status = 'Paused';
        } else {
            // Supplies are good, check if finished
            if (batch.potsDoneCount >= batch.outputCount) {
                batch.status = 'Finished';
                batch.potsDoneCount = batch.outputCount; // Cap the count
                machineState.activeBatchId = null; // <-- Machine is now free
            } else {
                // Supplies are good and not finished
                batch.status = 'Ongoing';
            }
        }
        
        // 4. Save both models
        await machineState.save();
        const updatedBatch = await batch.save();
        
        res.status(200).json(updatedBatch);

    } catch (error) {
        console.error("Error in updateBatch controller", error);
        res.status(500).json({ message: "Error updating batch" });
    }
}

export async function cancelBatch(req, res) {
    try {
        const batch = await Batch.findById(req.params.id);
        const machineState = await getOrCreateMachineState();

        if (!batch) {
            return res.status(404).json({ message: "Batch not found" });
        }

        if (batch.status !== 'Ongoing' && batch.status !== 'Paused') {
            return res.status(400).json({ message: `Batch cannot be cancelled, status is: ${batch.status}` });
        }

        try {
            await axios.post(`${HARDWARE_IP}/stop-batch`, null, { timeout: 2000 });
            console.log(`Successfully sent stop command to hardware for batch: ${batch._id}`);
        } catch (hwError) {
            console.error("CRITICAL: Failed to contact hardware to stop batch.", hwError.message);
        }
        
        // Update batch status
        batch.status = 'Cancelled';
        const updatedBatch = await batch.save();

        // Update machine state
        machineState.activeBatchId = null; // <-- Machine is now free
        await machineState.save();

        res.status(200).json(updatedBatch);

    } catch (error) {
        console.error("Error in cancelBatch controller", error);
        res.status(500).json({ message: "Error cancelling batch" });
    }
}

export async function deleteBatch(req, res) {
    try {
        const machineState = await getOrCreateMachineState();
        
        // Check if the batch to be deleted is the currently active one
        if (machineState.activeBatchId && machineState.activeBatchId.toString() === req.params.id) {
            return res.status(400).json({ message: "Cannot delete an active batch. Please cancel it first." });
        }

        const deletedBatch = await Batch.findByIdAndDelete(req.params.id);
        if (!deletedBatch) {
            return res.status(404).json({ message: "Batch not found" });
        }
        res.status(200).json({ message: "Batch Deleted Successfully" });
    } catch (error) {
        console.error("Error in deleteBatch controller", error);
        res.status(500).json({ message: "Error deleting batch" });
    }
}

export async function getAllBatch(_, res) {
    try {
        const batch = await Batch.find().sort({ createdAt: -1 });
        res.status(200).json(batch);
    } catch (error) {
        console.error("Error in getAllBatch controller",error);
        res.status(500).json({ message: "Error fetching batch" });
    }
}

export async function getBatchById(req, res) {
    try {
        const batch = await Batch.findById(req.params.id);
        if (!batch) {
            return res.status(404).json({ message: "Batch not found" });
        }
        res.status(200).json(batch);
    } catch (error) {
        console.error("Error in getBatchById controller", error);
        res.status(500).json({ message: "Error fetching batch" });
    }
}
