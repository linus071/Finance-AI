interface FinancialData {
    value: number;
    timestamp: string;
  }
  
  interface AnomalyResult extends FinancialData {
    zScore: number;
    isAnomaly: boolean;
  }
  
  /**
   * Calculates the standard deviation of an array of numbers.
   * Supports both population (default) and sample standard deviation (Bessel's correction).
   */
  export function getStandardDeviation(values: number[], useSample: boolean = false): number {
    if (values.length === 0) return 0;
  
    // 1. Calculate the mean (average)
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  
    // 2. Calculate the variance 
    const sumOfSquares = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
    
    // Use n - 1 for sample dataset, n for entire population
    const divisor = useSample ? values.length - 1 : values.length; 
    
    if (divisor <= 0) return 0;
    
    const variance = sumOfSquares / divisor;
  
    // 3. Return the square root of variance
    return Math.sqrt(variance);
  }
  
  /**
   * Flags financial anomalies using the Z-score method.
   * @param data Array of financial data points
   * @param threshold Number of standard deviations to trigger an anomaly (default: 3)
   */
  export function detectAnomalies(data: FinancialData[], threshold: number = 3): AnomalyResult[] {
    if (data.length === 0) return [];
  
    const values = data.map(d => d.value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const stdDev = getStandardDeviation(values, false);
  
    // If there is no variance (all values are identical), nothing is an anomaly
    if (stdDev === 0) {
      return data.map(d => ({ ...d, zScore: 0, isAnomaly: false }));
    }
  
    return data.map(item => {
      // Calculate how many standard deviations this point is from the mean
      const zScore = (item.value - mean) / stdDev;
      
      return {
        ...item,
        zScore: zScore,
        // Flag as anomaly if it exceeds the upper/lower standard deviation bounds
        isAnomaly: Math.abs(zScore) > threshold
      };
    });
  }