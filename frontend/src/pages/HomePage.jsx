import Navbar from "../components/Navbar";
import { useState, useEffect, useMemo, useRef } from "react"; // <-- Import useRef
import RateLimitedUI from "../components/RateLimitedUI";
import { toast } from "react-hot-toast";
import BatchCard from "../components/BatchCard";
import api from "../lib/axios";
import NotFound from "../components/NotFound";
import { LoaderIcon } from "lucide-react"; // <-- Import loader

// --- This component is needed for the dashboard ---
const SupplyStatus = ({ label, level }) => {
    const isLow = level === 0; // 0 = Low, 1 = Sufficient
    const statusText = isLow ? 'Low' : 'Sufficient';
    const colorClass = isLow ? 'text-error' : 'text-success';

    return (
        <div className="flex justify-between items-center p-4 bg-base-100 rounded-lg shadow">
            <span className="label-text font-medium">{label}</span>
            <span className={`font-bold ${colorClass} badge badge-outline badge-lg`}>{statusText}</span>
        </div>
    );
};
// ---

function HomePage() {
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [batches, setBatches] = useState([]); 
  const [machineState, setMachineState] = useState(null); 
  const [loadingBatches, setLoadingBatches] = useState(true); // <-- Split loading state
  const [loadingState, setLoadingState] = useState(true); // <-- Split loading state
  
  const pollingRef = useRef(null); // <-- Add ref for polling

  // --- Effect 1: Fetch Batch History (ONCE) ---
  useEffect(() => {
    const fetchBatchHistory = async () => {
      setLoadingBatches(true);
      try {
        const batchRes = await api.get("/batch");
        setBatches(batchRes.data);
        setIsRateLimited(false);
      } catch (error) {
        console.error("Error fetching batch history:", error);
        if (error.response && error.response.status === 429) {
          setIsRateLimited(true);
        } else {
          toast.error("Failed to load batch history");
        }
      } finally {
        setLoadingBatches(false);
      }
    };

    fetchBatchHistory();
  }, []); // Empty array, runs only once on mount

  // --- Effect 2: Fetch Machine State + Set up Polling ---
  useEffect(() => {
    const fetchMachineState = async () => {
      try {
        const stateRes = await api.get("/batch/machine-state"); // <-- New API call
        setMachineState(stateRes.data);
      } catch (error) {
        console.error("Error polling machine state:", error);
        // We don't show a toast on polling errors, it gets annoying
      } finally {
        setLoadingState(false);
      }
    };

    fetchMachineState(); // Run once immediately
    
    // Set up the polling interval
    pollingRef.current = setInterval(fetchMachineState, 3000); // Polls every 3 seconds

    // Cleanup function:
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []); // Empty array, runs once to set up polling

  // --- Memos (now update in real-time) ---
  const isBatchActive = useMemo(() => {
    return machineState?.activeBatchId != null;
  }, [machineState]);

  const areSuppliesLow = useMemo(() => {
    if (!machineState) return true; // Default to 'low' (disabled) while loading
    return machineState.soilLevel === 0 || machineState.cupLevel === 0;
  }, [machineState]);

  return (
    <div className="min-h-screen bg-base-200">
      <Navbar 
        isBatchActive={isBatchActive} 
        areSuppliesLow={areSuppliesLow} 
      />

      {isRateLimited && <RateLimitedUI />}

      <div className="max-w-7xl mx-auto p-4 mt-6">
        
        {/* --- ADDED: Machine State Dashboard --- */}
        <div className="mb-6">
            <h2 className="text-2xl font-bold mb-4">Machine Status</h2>
            {/* --- This section now updates every 3 seconds --- */}
            {loadingState ? (
                <div className="text-center"><LoaderIcon className="animate-spin size-6" /></div>
            ) : machineState ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SupplyStatus label="Soil Supply Level" level={machineState.soilLevel} />
                    <SupplyStatus label="Potting Cup Supply Level" level={machineState.cupLevel} />
                </div>
            ) : (
                <div className="text-center text-error">Could not load machine status.</div>
            )}
        </div>
        
        <h2 className="text-2xl font-bold mb-4">Batch History</h2>

        {/* --- This section only loads once --- */}
        {loadingBatches && (
          <div className="text-center py-10"><LoaderIcon className="animate-spin size-6" /></div>
        )}

        {batches.length === 0 && !loadingBatches && !isRateLimited && <NotFound />}

        {batches.length > 0 && !isRateLimited && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {batches.map((batch) => (
              <BatchCard key={batch._id} batch={batch} setBatch={setBatches}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default HomePage;

