import { useCallback, useState } from "react";
import GroupList from "./components/GroupList";
import CreateGroupButton from "./components/CreateGroupButton";
import "./App.css"; // Ensure you have Tailwind CSS imported here or in your main entry point

function App() {
  const [, setRefreshGroups] = useState<boolean>(false);

  const handleGroupCreated = useCallback(() => {
    setRefreshGroups((prev) => !prev);
  }, []);

  const handleGroupUpdated = useCallback(() => {
    setRefreshGroups((prev) => !prev);
  }, []);

  return (
    <div className="py-10 flex flex-col gap-4">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">My Groups</h1>
      </header>
      <main className="space-y-6">
        <GroupList onGroupUpdated={handleGroupUpdated} />
        <CreateGroupButton onGroupCreated={handleGroupCreated} />
      </main>
    </div>
  );
}

export default App;
