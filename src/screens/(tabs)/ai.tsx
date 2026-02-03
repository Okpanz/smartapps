import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    FlatList,
    LayoutAnimation,
    UIManager,
    ActivityIndicator,
    Image,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendMessageToGemini, ChatMessage } from '../../services/gemini';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'ai';
    timestamp: Date;
    isTyping?: boolean; // For the typewriter effect
}

const TypewriterText = ({ text, onComplete }: { text: string; onComplete?: () => void }) => {
    const [displayedText, setDisplayedText] = useState('');
    const indexRef = useRef(0);

    useEffect(() => {
        setDisplayedText('');
        indexRef.current = 0;

        const interval = setInterval(() => {
            if (indexRef.current < text.length) {
                setDisplayedText((prev) => prev + text.charAt(indexRef.current));
                indexRef.current += 1;
            } else {
                clearInterval(interval);
                if (onComplete) onComplete();
            }
        }, 15); // Adjust speed here (lower is faster)

        return () => clearInterval(interval);
    }, [text]);

    return (
        <Text className="text-[16px] leading-[24px] text-gray-900 tracking-tight" style={{ fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto' }}>
            {displayedText}
        </Text>
    );
};

export default function AIScreen() {
    const insets = useSafeAreaInsets();
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            text: 'Welcome to Smart Verification! 👋 I\'m your AI assistant, here to help you with biometric enrollment, answer questions about identity verification, and guide you through the process. How can I assist you today?',
            sender: 'ai',
            timestamp: new Date(),
        },
    ]);

    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    const handleTypingComplete = (id: string) => {
        setMessages((prev) =>
            prev.map((msg) =>
                msg.id === id ? { ...msg, isTyping: false } : msg
            )
        );
    };

    const handleSend = async () => {
        if (!inputText.trim()) return;

        const userMessageText = inputText.trim();
        const userMessage: Message = {
            id: Date.now().toString(),
            text: userMessageText,
            sender: 'user',
            timestamp: new Date(),
        };

        // Animate the new message entry
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

        // Add new message to the START of the array for inverted FlatList
        setMessages((prev) => [userMessage, ...prev]);
        setInputText('');
        setIsTyping(true);

        try {
            // Prepare history for Gemini
            let history: ChatMessage[] = messages
                .slice()
                .reverse()
                .map(msg => ({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.text }]
                }));

            // Gemini history must start with a 'user' role message
            if (history.length > 0 && history[0].role !== 'user') {
                history = history.slice(1);
            }

            const responseText = await sendMessageToGemini(userMessageText, history);

            const aiMessage: Message = {
                id: (Date.now() + 1).toString(),
                text: responseText,
                sender: 'ai',
                timestamp: new Date(),
                isTyping: true, // Mark as needing typewriter effect
            };

            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setMessages((prev) => [aiMessage, ...prev]);
        } catch (error) {
            console.error('Failed to get AI response', error);
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                text: "Sorry, I encountered an error. Please try again.",
                sender: 'ai',
                timestamp: new Date(),
            };
            setMessages((prev) => [errorMessage, ...prev]);
        } finally {
            setIsTyping(false);
        }
    };

    const renderItem = ({ item }: { item: Message }) => {
        if (item.sender === 'user') {
            return (
                <View className="flex-row justify-end mb-6 px-4">
                    <View
                        className="bg-[#157308] rounded-[20px] rounded-tr-sm px-5 py-3 shadow-sm max-w-[85%]"
                        style={{
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.1,
                            shadowRadius: 2,
                        }}
                    >
                        <Text className="text-white text-[16px] leading-[24px] tracking-tight font-normal">
                            {item.text}
                        </Text>
                    </View>
                </View>
            );
        }

        return (
            <View className="flex-row items-start mb-6 px-4 gap-3">
                <View className="w-8 h-8 rounded-full bg-emerald-100 items-center justify-center border border-emerald-200 mt-1">
                    <Image
                        source={require('../../assets/icon.png')} // Fallback or app icon
                        className="w-5 h-5"
                        resizeMode="contain"
                    />
                </View>
                <View className="flex-1 max-w-[85%]">
                    <Text className="text-[13px] font-semibold text-gray-900 mb-1 ml-1">Smart AI</Text>
                    <View className="bg-transparent">
                        {item.isTyping ? (
                            <TypewriterText
                                text={item.text}
                                onComplete={() => handleTypingComplete(item.id)}
                            />
                        ) : (
                            <Text className="text-[16px] leading-[24px] text-gray-900 tracking-tight" style={{ fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto' }}>
                                {item.text}
                            </Text>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View className="flex-1 bg-white">
            <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
                >
                    <View className="flex-1">
                        {/* Header */}
                        <View className="px-5 py-3 border-b border-gray-100 bg-white/80 backdrop-blur-xl flex-row items-center justify-between z-10">
                            <View className="flex-row items-center gap-2">
                                <Text className="text-[17px] font-semibold tracking-tight text-gray-900">Smart Chat</Text>
                                <View className="px-2 py-0.5 bg-gray-100 rounded-full">
                                    <Text className="text-[11px] font-medium text-gray-500">Gemini 1.5</Text>
                                </View>
                            </View>
                            <TouchableOpacity className="w-8 h-8 items-center justify-center rounded-full hover:bg-gray-50">
                                <Feather name="more-horizontal" size={20} color="#374151" />
                            </TouchableOpacity>
                        </View>

                        {/* Messages List */}
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            renderItem={renderItem}
                            keyExtractor={(item) => item.id}
                            inverted={true}
                            contentContainerStyle={{
                                paddingVertical: 24,
                            }}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                            ListHeaderComponent={
                                isTyping ? (
                                    <View className="flex-row items-start mb-6 px-4 gap-3">
                                        <View className="w-8 h-8 rounded-full bg-emerald-100 items-center justify-center border border-emerald-200 mt-1">
                                            <ActivityIndicator size="small" color="#10B981" />
                                        </View>
                                        <View className="mt-2">
                                            <View className="flex-row gap-1">
                                                <View className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" />
                                                <View className="w-2 h-2 rounded-full bg-gray-300 animate-bounce delay-75" />
                                                <View className="w-2 h-2 rounded-full bg-gray-300 animate-bounce delay-150" />
                                            </View>
                                        </View>
                                    </View>
                                ) : null
                            }
                        />

                        {/* Input Area */}
                        <View className="px-4 py-2 bg-white border-t border-gray-100">
                            <View
                                className="flex-row items-end gap-2 bg-gray-50 rounded-[26px] border border-gray-200 px-4 py-2"
                                style={{ minHeight: 52 }}
                            >
                                <TextInput
                                    className="flex-1 text-[16px] text-gray-900 max-h-32 leading-5 tracking-tight pt-3 pb-3"
                                    placeholder="Message Smart AI..."
                                    value={inputText}
                                    onChangeText={setInputText}
                                    multiline
                                    onSubmitEditing={handleSend}
                                    blurOnSubmit={false}
                                    placeholderTextColor="#9CA3AF"
                                    editable={!isTyping}
                                    style={{ fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto' }}
                                />
                                <TouchableOpacity
                                    onPress={handleSend}
                                    disabled={!inputText.trim() || isTyping}
                                    className={`w-8 h-8 mb-2 rounded-full items-center justify-center ${inputText.trim() && !isTyping
                                        ? 'bg-black'
                                        : 'bg-gray-200'
                                        }`}
                                >
                                    <Feather
                                        name="arrow-up"
                                        size={18}
                                        color={inputText.trim() ? 'white' : '#9CA3AF'}
                                    />
                                </TouchableOpacity>
                            </View>
                            <Text className="text-center text-[10px] text-gray-400 mt-2 mb-1">
                                AI can make mistakes. Check important info.
                            </Text>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}
