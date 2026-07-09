/**
 * useBins — state management hook for Fundamental Knowledge Bins.
 *
 * Gap detection logic:
 *   - "next gap" = lowest-indexed bin with state === "empty"
 *   - Fill: write note → state becomes "filled"
 *   - Skip: state becomes "deferred" → next gap advances
 *   - No bin auto-fills another. Each must be acted on independently.
 */

import { useState, useCallback, useMemo } from "react";
import type { Bin, BinState } from "./FundamentalBins";

export interface BinNote {
  binIndex: number;
  concept:  string;
  note:     string;
  filledAt: string;  // ISO timestamp
}

interface UseBinsReturn {
  bins:            Bin[];
  binNotes:        BinNote[];
  activeBinIndex:  number | null;
  nextGapBin:      Bin | null;
  filledCount:     number;
  isComplete:      boolean;
  addConcepts:     (concepts: string[]) => void;
  fillBin:         (index: number, note: string) => void;
  deferBin:        (index: number) => void;
  markUnderstood:  (index: number) => void;
  promptNextGap:   () => void;
  dismissPrompt:   () => void;
}

const MAX_BINS = 100;

function createBin(index: number, concept: string): Bin {
  return { index, concept, state: "empty" };
}

export function useBins(initialConcepts: string[] = []): UseBinsReturn {
  const [bins, setBins] = useState<Bin[]>(() =>
    initialConcepts.slice(0, MAX_BINS).map((c, i) => createBin(i + 1, c))
  );
  const [binNotes, setBinNotes] = useState<BinNote[]>([]);
  const [activeBinIndex, setActiveBinIndex] = useState<number | null>(null);

  // Next gap = lowest-indexed empty bin
  const nextGapBin = useMemo(
    () => bins.find((b) => b.state === "empty") ?? null,
    [bins]
  );

  const filledCount = useMemo(() => bins.filter((b) => b.state === "filled").length, [bins]);
  const isComplete  = bins.length > 0 && filledCount === bins.length;

  // Add new concepts (from keyword detection), deduplicated, capped at MAX_BINS
  const addConcepts = useCallback((concepts: string[]) => {
    setBins((prev) => {
      const existing = new Set(prev.map((b) => b.concept.toLowerCase()));
      const fresh = concepts
        .filter((c) => !existing.has(c.toLowerCase()))
        .slice(0, MAX_BINS - prev.length);
      const startIndex = prev.length + 1;
      const newBins = fresh.map((c, i) => createBin(startIndex + i, c));
      return [...prev, ...newBins];
    });
  }, []);

  const updateBinState = useCallback((index: number, state: BinState) => {
    setBins((prev) => prev.map((b) => b.index === index ? { ...b, state } : b));
  }, []);

  const fillBin = useCallback((index: number, note: string) => {
    updateBinState(index, "filled");
    setBinNotes((prev) => [
      ...prev,
      {
        binIndex: index,
        concept:  bins.find((b) => b.index === index)?.concept ?? "",
        note,
        filledAt: new Date().toISOString(),
      },
    ]);
    // Auto-advance active prompt to next gap after filling
    setActiveBinIndex((current) => {
      if (current !== index) return current;
      const nextEmpty = bins.find((b) => b.state === "empty" && b.index !== index);
      return nextEmpty?.index ?? null;
    });
  }, [bins, updateBinState]);

  const deferBin = useCallback((index: number) => {
    updateBinState(index, "deferred");
    // Advance prompt to next empty bin
    setActiveBinIndex(
      bins.find((b) => b.state === "empty" && b.index !== index)?.index ?? null
    );
  }, [bins, updateBinState]);

  const markUnderstood = useCallback((index: number) => {
    updateBinState(index, "filled");
    setBinNotes((prev) => [
      ...prev,
      {
        binIndex: index,
        concept:  bins.find((b) => b.index === index)?.concept ?? "",
        note:     "(marked as understood)",
        filledAt: new Date().toISOString(),
      },
    ]);
  }, [bins, updateBinState]);

  const promptNextGap = useCallback(() => {
    setActiveBinIndex(nextGapBin?.index ?? null);
  }, [nextGapBin]);

  const dismissPrompt = useCallback(() => setActiveBinIndex(null), []);

  return {
    bins,
    binNotes,
    activeBinIndex,
    nextGapBin,
    filledCount,
    isComplete,
    addConcepts,
    fillBin,
    deferBin,
    markUnderstood,
    promptNextGap,
    dismissPrompt,
  };
}
