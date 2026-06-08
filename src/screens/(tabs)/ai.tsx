import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Platform,
    FlatList,
    LayoutAnimation,
    UIManager,
    ActivityIndicator,
    Image,
    Keyboard,
    Animated,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT, TAB_BAR_BOTTOM_MARGIN } from '../../navigation/TabNavigator';
import { sendMessageToGemini, ChatMessage } from '../../services/gemini';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'ai';
    timestamp: Date;
    isTyping?: boolean;
}

// ─── Keyboard-aware bottom offset hook ────────────────────────────────────────
// Measures the real keyboard height and animates the input bar up/down.
// Works correctly regardless of floating tab bar positioning.
function useKeyboardOffset() {
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const onShow = (e: any) => setKeyboardHeight(e.endCoordinates.height);
        const onHide = () => setKeyboardHeight(0);

        const sub1 = Keyboard.addListener(showEvent, onShow);
        const sub2 = Keyboard.addListener(hideEvent, onHide);
        return () => { sub1.remove(); sub2.remove(); };
    }, []);

    return keyboardHeight;
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
                onComplete?.();
            }
        }, 15);
        return () => clearInterval(interval);
    }, [text]);

    return (
        <Text
            className="text-[16px] leading-[24px] text-gray-900 tracking-tight"
            style={{ fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto' }}
        >
            {displayedText}
        </Text>
    );
};

export default function AIScreen() {
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardOffset();

    // The floating tab bar sits at bottom + margin. When keyboard is up,
    // we only need to offset by keyboard height (keyboard covers the tab bar).
    // When keyboard is down, we offset by the tab bar's total footprint.
    const tabBarFootprint = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_MARGIN;

    // Bottom padding for the container that holds both the list and input bar.
    // When keyboard is visible: keyboard height (tab bar is behind keyboard).
    // When keyboard is hidden: tab bar footprint.
    const containerBottom = keyboardHeight > 0
        ? keyboardHeight
        : tabBarFootprint;

    // FlatList content needs extra breathing room above the input bar.
    // The input bar is ~80px tall — add that on top of containerBottom.
    const INPUT_BAR_HEIGHT = 80;
    const listPaddingBottom = INPUT_BAR_HEIGHT + (keyboardHeight > 0 ? 8 : 0);

    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            text: "Welcome to Smart Verification! 👋 I'm your AI assistant, here to help you with biometric enrollment, answer questions about identity verification, and guide you through the process. How can I assist you today?",
            sender: 'ai',
            timestamp: new Date(),
        },
    ]);
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    const handleTypingComplete = (id: string) => {
        setMessages((prev) =>
            prev.map((msg) => (msg.id === id ? { ...msg, isTyping: false } : msg))
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
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setMessages((prev) => [userMessage, ...prev]);
        setInputText('');
        setIsTyping(true);
        try {
            let history: ChatMessage[] = messages
                .slice()
                .reverse()
                .map((msg) => ({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.text }],
                }));
            if (history.length > 0 && history[0].role !== 'user') {
                history = history.slice(1);
            }
            const responseText = await sendMessageToGemini(userMessageText, history);
            const aiMessage: Message = {
                id: (Date.now() + 1).toString(),
                text: responseText,
                sender: 'ai',
                timestamp: new Date(),
                isTyping: true,
            };
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setMessages((prev) => [aiMessage, ...prev]);
        } catch {
            setMessages((prev) => [
                {
                    id: (Date.now() + 1).toString(),
                    text: 'Sorry, I encountered an error. Please try again.',
                    sender: 'ai',
                    timestamp: new Date(),
                },
                ...prev,
            ]);
        } finally {
            setIsTyping(false);
        }
    };

    const renderItem = ({ item }: { item: Message }) => {
        if (item.sender === 'user') {
            return (
                <View className="flex-row justify-end mb-6 px-4">
                    <View
                        className="bg-[#157308] rounded-[20px] rounded-tr-sm px-5 py-3 max-w-[85%]"
                        style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 }}
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
                        source={require('../../assets/icon.png')}
                        className="w-5 h-5"
                        resizeMode="contain"
                    />
                </View>
                <View className="flex-1 max-w-[85%]">
                    <Text className="text-[13px] font-semibold text-gray-900 mb-1 ml-1">Smart AI</Text>
                    {item.isTyping ? (
                        <TypewriterText text={item.text} onComplete={() => handleTypingComplete(item.id)} />
                    ) : (
                        <Text
                            className="text-[16px] leading-[24px] text-gray-900 tracking-tight"
                            style={{ fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto' }}
                        >
                            {item.text}
                        </Text>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
            {/* ── Header ── sits at the very top, respects notch */}
            <View
                style={{ paddingTop: insets.top }}
                className="bg-white border-b border-gray-100 z-10"
            >
                <View className="px-5 py-3 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                        <Text className="text-[17px] font-semibold tracking-tight text-gray-900">
                            Smart Chat
                        </Text>
                        <View className="px-2 py-0.5 bg-gray-100 rounded-full">
                            <Text className="text-[11px] font-medium text-gray-500">Gemini 1.5</Text>
                        </View>
                    </View>
                    <TouchableOpacity className="w-8 h-8 items-center justify-center rounded-full">
                        <Feather name="more-horizontal" size={20} color="#374151" />
                    </TouchableOpacity>
                </View>
            </View>

            {/*
             * ── Content area ──
             * paddingBottom = tab bar footprint OR keyboard height.
             * This single value does all the work:
             *   • Keyboard hidden → content stops above the floating tab bar.
             *   • Keyboard visible → content stops above the keyboard.
             *     (The tab bar is behind the keyboard so no double-counting.)
             */}
            <View style={{ flex: 1, paddingBottom: containerBottom }}>
                {/* Messages */}
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    inverted
                    contentContainerStyle={{ paddingVertical: 24, paddingBottom: listPaddingBottom }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    ListHeaderComponent={
                        isTyping ? (
                            <View className="flex-row items-start mb-6 px-4 gap-3">
                                <View className="w-8 h-8 rounded-full bg-emerald-100 items-center justify-center border border-emerald-200 mt-1">
                                    <ActivityIndicator size="small" color="#10B981" />
                                </View>
                                <View className="mt-2 flex-row gap-1">
                                    <View className="w-2 h-2 rounded-full bg-gray-300" />
                                    <View className="w-2 h-2 rounded-full bg-gray-300" />
                                    <View className="w-2 h-2 rounded-full bg-gray-300" />
                                </View>
                            </View>
                        ) : null
                    }
                />

                {/* ── Input bar ── always pinned to the bottom of the content area */}
                <View
                    className="px-4 py-2 bg-white border-t border-gray-100"
                    style={{ paddingBottom: Math.max(insets.bottom, 8) }}
                >
                    <View
                        className="flex-row items-end gap-2 bg-gray-50 rounded-[26px] border border-gray-200 px-4 py-2"
                        style={{ minHeight: 52 }}
                    >
                        <TextInput
                            className="flex-1 text-[16px] text-gray-900 max-h-32 leading-5 tracking-tight"
                            style={{
                                paddingTop: 12,
                                paddingBottom: 12,
                                fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
                            }}
                            placeholder="Message Smart AI..."
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                            onSubmitEditing={handleSend}
                            blurOnSubmit={false}
                            placeholderTextColor="#9CA3AF"
                            editable={!isTyping}
                        />
                        <TouchableOpacity
                            onPress={handleSend}
                            disabled={!inputText.trim() || isTyping}
                            className={`w-8 h-8 mb-2 rounded-full items-center justify-center ${
                                inputText.trim() && !isTyping ? 'bg-black' : 'bg-gray-200'
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
        </View>
    );
}