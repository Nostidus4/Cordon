import { createContext, useContext } from "react";
/** Lets node components select themselves (mouse + keyboard) without callbacks travelling through node data. */
export interface GraphActions { select: (id: string) => void }
export const GraphActionsContext = createContext<GraphActions>({ select: () => {} });
export const useGraphActions = () => useContext(GraphActionsContext);
