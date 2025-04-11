// app/models/[id].tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, TouchableOpacity, Modal, ScrollView } from 'react-native'; // Using ScrollView from react-native for broader compatibility
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Progress } from 'tamagui';
import { Model } from '~/types/civitai';
import axios from 'axios';
import RenderHTML from 'react-native-render-html';
import Carousel, { ICarouselInstance } from 'react-native-reanimated-carousel';
import Animated from 'react-native-reanimated';
import { X } from '@tamagui/lucide-icons';
import ImageViewer from 'react-native-image-zoom-viewer';
import ModelDownloadButton from '~/components/ModelDownloadButton';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const ModelDetailScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const [model, setModel] = useState<Model | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const carouselRef = useRef<ICarouselInstance>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isModalVisible, setModalVisible] = useState(false);
    const [selectedImage, setSelectedImage] = useState<number | null>(null);
    const [isCarouselDragging, setIsCarouselDragging] = useState<boolean>(false)

    useEffect(() => {
        const fetchModelDetails = async () => {
            setLoading(true);
            setError(null);
            try {
                const apiUrl = `https://civitai.com/api/v1/models/${id}?token=${process.env.EXPO_PUBLIC_CIVITAI_API_TOKEN}&nsfw=true`;

                const response = await axios.get(apiUrl);
                setModel(response.data);
            } catch (e: any) {
                setError(e.message);
                console.error("Error fetching model details:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchModelDetails();
    }, [id, router]);

    if (loading) {
        return (
            <View style={styles.centered}>
                <Progress size="large" />
            </View>
        );
    }

    if (error) {
        return <Text>Error loading model details: {error}</Text>;
    }

    if (!model) {
        return <Text>Model not found.</Text>;
    }

    const { width } = Dimensions.get('window');

    // Extract all image URLs from all model versions
    const allImages = model.modelVersions?.reduce((acc, version) => {
        if (version.images) {
            return acc.concat(version.images.map(img => img.url));
        }
        return acc;
    }, [] as string[]) || [];

    const handleImagePress = (imageIndex: number) => {
        if (!isCarouselDragging) {
            setSelectedImage(imageIndex);
            setModalVisible(true);
        }
    };

    const renderItem = ({ item, index }: { item: string, index: number }) => (
        <TouchableOpacity onPress={() => handleImagePress(index)} style={{ width: screenWidth, justifyContent: 'center', alignItems: 'center' }}>
            <Image
                source={{ uri: item }}
                style={{ width: screenWidth * 0.8, height: screenHeight * 0.6, resizeMode: 'contain' }}
            />
        </TouchableOpacity>
    );

    const goToPrevious = () => {
        carouselRef.current?.prev();
    };

    const goToNext = () => {
        carouselRef.current?.next();
    };

    return (
        <ScrollView style={styles.container} nestedScrollEnabled={true}>
            <View style={{
                flexDirection: "row",
                justifyContent: "space-between"
            }}>
                <View style={styles.header}>
                    <Text style={styles.title}>{model.name}</Text>
                    <Text style={styles.type}>Type: {model.type}</Text>
                </View>
                <TouchableOpacity onPress={() => router.back()}>
                    <X />
                </TouchableOpacity>
            </View>

            {allImages.length > 0 && (
                <View style={styles.carouselContainer}>
                    <Carousel
                        ref={carouselRef}
                        loop={false}
                        width={screenWidth}
                        height={screenHeight * 0.7}
                        data={allImages}
                        renderItem={renderItem}
                        onSnapToItem={(index) => setCurrentIndex(index)}
                        onScrollStart={() => setIsCarouselDragging(true)}
                        onScrollEnd={() => setIsCarouselDragging(false)}
                    />
                    <View style={styles.paginationContainer}>
                        <TouchableOpacity onPress={goToPrevious} style={styles.navigationButton}>
                            <Text>Previous</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={goToNext} style={styles.navigationButton}>
                            <Text>Next</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <View style={styles.detailsContainer}>
                <ModelDownloadButton modelId={model.id} />
                <RenderHTML contentWidth={width} source={{ html: model.description || '' }} />
                {/* Add more details here */}
            </View>

            <Modal visible={isModalVisible} transparent={true} onRequestClose={() => setModalVisible(false)}>
                {selectedImage !== null && (
                    <ImageViewer
                        imageUrls={allImages.map((url) => ({ url }))}
                        enableSwipeDown={true}
                        onSwipeDown={() => setModalVisible(false)}
                        renderHeader={() => (
                            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setModalVisible(false)}>
                                <X />
                            </TouchableOpacity>
                        )}
                        index={selectedImage}
                        enableImageZoom={true}
                    />
                )}
            </Modal>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        flex: 1,
        padding: 16,
    },
    header: {
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    type: {
        fontSize: 16,
        color: 'gray',
    },
    carouselContainer: {
        height: screenHeight * 0.7, // Adjust as needed
        marginBottom: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    paginationContainer: {
        position: 'absolute',
        bottom: 16, // Adjust this value to move buttons higher or lower
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    navigationButton: {
        padding: 10,
        backgroundColor: '#eee',
        borderRadius: 5,
    },
    detailsContainer: {
        marginTop: 16,
    },
    modalCloseButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(255, 255, 255, 1)',
        padding: 4,
        borderRadius: 5,
        zIndex: 2, // Ensure it's above the image viewer
    },
    modalCloseButtonText: {
        color: 'white',
        fontSize: 16,
    },
});

export default ModelDetailScreen;