"use client";

import { useCallback, useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  const increment = useCallback(() => {
    setCount((current) => current + 1);
  }, []);

  return (
    <button type="button" onClick={increment}>
      Count: {count}
    </button>
  );
}
