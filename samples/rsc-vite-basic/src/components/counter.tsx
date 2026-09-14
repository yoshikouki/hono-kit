// biome-ignore-all lint/performance/noJsxPropsBind: DOM event handlers in this sample do not need stable references.
"use client";

import { createContext, startTransition, useContext, useState, ViewTransition } from "react";

export const CounterLabel = createContext("Count");

export function Counter() {
  const label = useContext(CounterLabel);
  const [count, setCount] = useState(0);

  return (
    <ViewTransition>
      <button
        type="button"
        onClick={() => startTransition(() => setCount((current) => current + 1))}
      >
        {label}: {count}
      </button>
    </ViewTransition>
  );
}
