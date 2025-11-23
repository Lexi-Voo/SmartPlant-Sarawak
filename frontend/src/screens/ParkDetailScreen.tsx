import React, { useState } from 'react';
import ParkDetailModal from './ParkDetailModal';

const ParkDetailScreen = ({ route, navigation }: any) => {
  const { park } = route.params;
  const [visible, setVisible] = useState(true);

  const closeModal = () => {
    setVisible(false);
    navigation.goBack();
  };

  return (
    <ParkDetailModal
      visible={visible}
      onClose={closeModal}
      park={park}
    />
  );
};

export default ParkDetailScreen;
