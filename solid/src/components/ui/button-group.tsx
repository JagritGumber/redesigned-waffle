import {
  createContext,
  useContext,
  For,
  type ParentProps,
} from "solid-js";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

interface ButtonGroupContextValue {
  selected: () => string | undefined;
  setSelected: (value: string) => void;
}

const ButtonGroupContext = createContext<ButtonGroupContextValue>();

interface ButtonGroupProps extends ParentProps {
  value: string | undefined;
  onChange: (value: string) => void;
  options: string[];
  class?: string;
}

export function ButtonGroup(props: ButtonGroupProps) {
  const selected = () => props.value;
  const setSelected = (value: string) => props.onChange(value);

  return (
    <ButtonGroupContext.Provider value={{ selected, setSelected }}>
      <div class={cn("flex space-x-2", props.class)}>
        <For each={props.options}>
          {(option) => (
            <Button
              variant={selected() === option ? "default" : "outline"}
              onClick={() => setSelected(option)}
            >
              {option}
            </Button>
          )}
        </For>
      </div>
    </ButtonGroupContext.Provider>
  );
}

export function useButtonGroup() {
  const context = useContext(ButtonGroupContext);
  if (!context) {
    throw new Error("useButtonGroup must be used within a ButtonGroupProvider");
  }
  return context;
}
