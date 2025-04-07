import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ConnectPatreonButton from "./ConnectPatreonButton";
import ConnectDeviantArtButton from "./ConnectDeviantArtButton";

interface Group {
  id: string;
  name: string;
  patreonAccountId: string | null;
  deviantartAccountId: string | null;
  // Add other properties of your group object if necessary
}

interface GroupListProps {
  onGroupUpdated: () => void;
}

function GroupList({ onGroupUpdated }: GroupListProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("http://127.0.0.1:8787/api/v1/group");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = (await response.json()) as { groups?: Group[] };
      setGroups(data.groups || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  if (loading) {
    return <div>Loading groups...</div>;
  }

  if (error) {
    return <div>Error loading groups: {error}</div>;
  }

  return (
    <div>
      <div className="grid gap-4">
        {groups.map((group) => (
          <Card key={group.id}>
            <CardHeader>
              <CardTitle>{group.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center space-x-4">
              <ConnectPatreonButton
                groupId={group.id}
                onConnected={onGroupUpdated}
                isConnected={!!group.patreonAccountId}
              />
              <ConnectDeviantArtButton
                groupId={group.id}
                onConnected={onGroupUpdated}
                isConnected={!!group.deviantartAccountId}
              />
            </CardContent>
          </Card>
        ))}
      </div>
      {groups.length === 0 && (
        <p className="text-muted-foreground">No groups created yet.</p>
      )}
    </div>
  );
}

export default GroupList;
