import { createContext, useContext } from "react";
/** Lets nodes toggle their person (mouse + keyboard) without callbacks travelling through node data. `picked` = principals currently in the selection. */
export interface GraphActions { toggle: (principalId: string) => void; picked: ReadonlySet<string> }
export const GraphActionsContext = createContext<GraphActions>({ toggle: () => {}, picked: new Set() });
export const useGraphActions = () => useContext(GraphActionsContext);
