import "../transitions.css";
import { Activity, ViewTransition } from "react";
import { Counter, CounterLabel } from "../components/counter";

export default function HomePage() {
  return (
    <>
      <h1>RSC Basic</h1>
      <CounterLabel value="React 19.3 count">
        <Activity mode="visible">
          <ViewTransition>
            <Counter />
          </ViewTransition>
        </Activity>
      </CounterLabel>
    </>
  );
}
