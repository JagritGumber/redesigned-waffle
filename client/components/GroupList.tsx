import { useCallback, useEffect, useState } from "react";
import axios from "axios"
import { ScrollView } from 'react-native';
import { Card, Text, View } from 'tamagui'; // Assuming direct import
import ConnectPatreonButton from "./ConnectPatreonButton"; // Ensure this is adapted for React Native/Tamagui
import ConnectDeviantArtButton from "./ConnectDeviantArtButton"; // Ensure this is adapted for React Native/Tamagui

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
            const response = await axios.get(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/group`);
            console.log(response)
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
        return <Text>Loading groups...</Text>;
    }

    if (error) {
        return <Text>Error loading groups: {error}</Text>;
    }

    return (
        <ScrollView>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}> {/* Equivalent to grid gap-4 */}
                {groups.map((group) => (
                    <Card key={group.id} style={{ width: '100%', maxWidth: 300 }}> {/* Basic card styling */}
                        <View padding={16}> {/* Equivalent to CardHeader */}
                            <Text fontSize={18} fontWeight="bold">{group.name}</Text> {/* Equivalent to CardTitle */}
                        </View>
                        <View padding={16} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}> {/* Equivalent to CardContent className="flex items-center space-x-4" */}
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
                        </View>
                    </Card>
                ))}
            </View>
            {groups.length === 0 && (
                <Text color="$color.gray300">No groups created yet.</Text>
            )}
        </ScrollView>
    );
}

export default GroupList;