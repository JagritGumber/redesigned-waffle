import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

interface CreateGroupButtonProps {
  onGroupCreated: () => void;
}

function CreateGroupButton({ onGroupCreated }: CreateGroupButtonProps) {
  const [showInput, setShowInput] = useState<boolean>(false);
  const [groupName, setGroupName] = useState<string>("");
  const [creationError, setCreationError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim()) {
      return;
    }
    setIsCreating(true);
    setCreationError(null);
    try {
      const response = await fetch("http://127.0.0.1:8787/api/v1/group", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: groupName }),
      });
      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }
      setGroupName("");
      setShowInput(false);
      if (onGroupCreated) {
        onGroupCreated(); // Callback to refresh the list
      }
    } catch (e: any) {
      setCreationError(e.message);
    } finally {
      setIsCreating(false);
    }
  }, [groupName, onGroupCreated]);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setGroupName(event.target.value);
    },
    []
  );

  const toggleInput = useCallback(() => {
    setShowInput(!showInput);
  }, [showInput]);

  return (
    <div className="mt-6">
      <h2 className="mb-4 text-xl font-semibold">Create New Group</h2>
      {!showInput ? (
        <Button onClick={toggleInput}>Create New Group</Button>
      ) : (
        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                value={groupName}
                onChange={handleInputChange}
              />
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleCreateGroup} disabled={isCreating}>
                {isCreating ? "Creating..." : "Create"}
              </Button>
              <Button type="button" variant="outline" onClick={toggleInput}>
                Cancel
              </Button>
            </div>
            {creationError && (
              <p className="text-destructive">{creationError}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default CreateGroupButton;
