import Batch from '../models/Batch.js';
import MachineState from '../models/machineState.js';
import axios from 'axios';

const HARDWARE_IP = "http://192.168.1.50"; // (Your ESP's IP)

// --- HELPER FUNCTION ---
async function getOrCreateMachineState() {
    let state = await MachineState.findOne({ systemName: 'main' });
    if (!state) {
        state = new MachineState();
        await state.save();
    }
    return state;
}

export async function getMachineState(req, res) {
    try {
        const state = await getOrCreateMachineState();
        res.status(200).json(state);
    } catch (error) {
        console.error("Error in getMachineState", error);
        res.status(500).json({ message: "Error fetching machine state" });
    }
}

// This handles dedicated updates for Soil and Cup levels
export async function updateMachineState(req, res) {
    try {
        const { soilLevel, cupLevel } = req.body;
        const machineState = await getOrCreateMachineState();

        // Update the MachineState document
        if (soilLevel !== undefined) machineState.soilLevel = soilLevel;
        if (cupLevel !== undefined) machineState.cupLevel = cupLevel;
        await machineState.save();

        // Check if a batch is active and needs to be paused or resumed
        if (machineState.activeBatchId) {
            const activeBatch = await Batch.findById(machineState.activeBatchId);
            if (activeBatch && activeBatch.status !== 'Finished' && activeBatch.status !== 'Cancelled') {
                
                // If supplies are low, PAUSE the active batch
                if (machineState.soilLevel === 0 || machineState.cupLevel === 0) {
                    if (activeBatch.status !== 'Paused') {
                        activeBatch.status = 'Paused';
                        await activeBatch.save();
                    }
                } 
                // If supplies are good AND the batch was paused, RESUME it
                else if (activeBatch.status === 'Paused') {
                    activeBatch.status = 'Ongoing';
                    await activeBatch.save();
                }
            }
        }
        
        res.status(200).json(machineState);

    } catch (error) {
        console.error("Error in updateMachineState", error);
        res.status(500).json({ message: "Error updating machine state" });
    }
}


// This now only handles pot increments
export async function updateBatch(req, res) {
    try {
        const { potsIncrement } = req.body;
        
        // This function should only be called if a pot is incremented
        if (!potsIncrement) {
            return res.status(400).json({ message: "No pot increment provided" });
        }

        const batch = await Batch.findById(req.params.id);
        const machineState = await getOrCreateMachineState();

        if (!batch) {
            return res.status(404).json({ message: "Batch not found" });
        }
        if (batch.status === 'Finished' || batch.status === 'Cancelled') {
            return res.status(400).json({ message: "This batch is already complete." });
        }

        batch.potsDoneCount += Number(potsIncrement);

        // Check for completion
        if (batch.potsDoneCount >= batch.outputCount) {
            batch.status = 'Finished';
            batch.potsDoneCount = batch.outputCount; // Cap the count
            machineState.activeBatchId = null; 
        } else {
            // Batch is not finished. Check if supplies are low.
            if (machineState.soilLevel === 0 || machineState.cupLevel === 0) {
                batch.status = 'Paused';
            } else {
                batch.status = 'Ongoing';
            }
        }
        
        // Save both models
        await machineState.save();
        const updatedBatch = await batch.save();
        
        res.status(200).json(updatedBatch);

    } catch (error) {
        console.error("Error in updateBatch controller", error);
        res.status(500).json({ message: "Error updating batch" });
    }
}

export async function createBatch(req, res) {
    try {
        const { title, seedType, outputCount } = req.body;
        
        const machineState = await getOrCreateMachineState();

        if (machineState.activeBatchId) {
            return res.status(400).json({ message: "A batch is already in progress." });
        }
        if (machineState.soilLevel === 0 || machineState.cupLevel === 0) {
            return res.status(400).json({ message: "Cannot start: Supplies are low." });
        }

        const batch = new Batch({ title, seedType, outputCount });
        const savedBatch = await batch.save();

        try {
            await axios.post(`${HARDWARE_IP}/start-batch`, {
                batchId: savedBatch._id
            }, { timeout: 2000 });
            console.log(`Successfully sent start command to hardware for batch: ${savedBatch._id}`);
        } catch (hwError) {
            console.error("CRITICAL: Failed to contact hardware.", hwError.message);
        }

        machineState.activeBatchId = savedBatch._id;
        await machineState.save();
        
        res.status(201).json(savedBatch);

    } catch (error) {
        console.error("Error in createBatch controller", error);
        res.status(500).json({ message: "Error creating batch" });
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
