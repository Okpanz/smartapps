import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_HEIGHT = 68;

const useInsets = () => {
  const insets = useSafeAreaInsets();

  return { 
    bottom: insets.bottom + TAB_BAR_HEIGHT + 20, 
    top: insets.top 
  };
};

export default useInsets;
