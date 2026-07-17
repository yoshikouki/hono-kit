// biome-ignore-all lint/performance/noJsxPropsBind: DOM event handlers in this sample do not need stable references.
"use client";

import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button
      type="button"
      onClick={() => setCount((current) => current + 1)}
    >
      Count: {count}
    </button>
  );
}
