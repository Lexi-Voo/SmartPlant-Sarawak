"""
============================================================================
SMARTPLANT SARAWAK - AI MODEL TRAINING SCRIPT
============================================================================

PURPOSE:
This script trains a MobileNetV2-based deep learning model to identify 
15 native Sarawak plant species from images.

MAIN SECTIONS:
1. Data Loading - Loads train/validation/test datasets
2. Model Architecture - MobileNetV2 with custom classification head
3. Training - Trains the model for 20 epochs
4. Evaluation - Tests accuracy and generates metrics
5. Visualization - Creates confusion matrix and accuracy plots
6. Model Saving - Saves trained model for deployment

HOW IT WORKS:
- Uses transfer learning with MobileNetV2 (pre-trained on ImageNet)
- Freezes base layers, only trains classification head
- Uses MobileNetV2 preprocessing (scales to [-1, 1] range)
- Achieves 80-95% accuracy on Sarawak plant species

REQUIREMENTS:
pip install tensorflow==2.16.1 numpy pillow matplotlib seaborn scikit-learn

OUTPUT:
- Trained model: plant_model_results1/mobilenetv2_plant_model.h5
- Confusion matrix: plant_model_results1/confusion_matrix.png
- Classification report: plant_model_results1/classification_report.txt

USAGE:
python model.py

============================================================================
"""

# ============================================================================
# SECTION 1: IMPORTS
# ============================================================================

import os  # File and directory operations
import numpy as np  # Numerical computing
import matplotlib.pyplot as plt  # Plotting graphs
import seaborn as sns  # Statistical data visualization
from tensorflow.keras.preprocessing import image_dataset_from_directory  # Load images from folders
from tensorflow.keras.applications import MobileNetV2  # Pre-trained model
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input  # CRITICAL for correct preprocessing
from tensorflow.keras.models import Sequential  # Sequential model architecture
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D, Dropout  # Neural network layers
from tensorflow.keras.optimizers import Adam  # Optimizer for training
from sklearn.metrics import confusion_matrix, classification_report  # Evaluation metrics
import tensorflow as tf  # TensorFlow deep learning framework


# ============================================================================
# SECTION 2: CONFIGURATION
# ============================================================================

data_dir = "dataset_split"  # Path to train/val/test dataset directory (adjust if needed)
save_dir = "plant_model_results1"  # Directory where results will be saved
os.makedirs(save_dir, exist_ok=True)  # Create results directory if it doesn't exist

img_size = (224, 224)  # Input image size for MobileNetV2 (required: 224x224)
batch_size = 32  # Number of images processed together (adjust based on GPU memory)
epochs = 20  # Number of complete passes through training data

# ============================================================================
# SECTION 3: DATA LOADING
# ============================================================================

# Load training dataset (80% of data)
# Automatically labels images based on folder names
train_ds = image_dataset_from_directory(
    os.path.join(data_dir, "train"),  # Path to training images
    image_size=img_size,  # Resize all images to 224x224
    batch_size=batch_size  # Load 32 images at a time
)

# Load validation dataset (10% of data)
# Used to tune hyperparameters and prevent overfitting
val_ds = image_dataset_from_directory(
    os.path.join(data_dir, "val"),  # Path to validation images
    image_size=img_size,  # Resize to 224x224
    batch_size=batch_size  # Process in batches of 32
)

# Load test dataset (10% of data)
# Used for final accuracy evaluation (never seen during training)
test_ds = image_dataset_from_directory(
    os.path.join(data_dir, "test"),  # Path to test images
    image_size=img_size,  # Resize to 224x224
    batch_size=batch_size,  # Process in batches
    shuffle=False  # Keep original order for evaluation
)

# ============================================================================
# SECTION 4: CLASS DETECTION & PREPROCESSING
# ============================================================================

# Automatically detect plant species from folder names
class_names = train_ds.class_names  # e.g., ['Rafflesia', 'Nepenthes', 'Begonias', ...]
num_classes = len(class_names)  # Number of plant species (15 for Sarawak)
print(f"Detected {num_classes} classes: {class_names}")

# Performance optimization: prefetch next batch while training current batch
AUTOTUNE = tf.data.AUTOTUNE  # Automatically tune prefetch buffer size

# Apply MobileNetV2 preprocessing to all datasets
# CRITICAL: This preprocessing scales images to [-1, 1] range (NOT [0, 1]!)
# This MUST match the preprocessing used in app.py for predictions
train_ds = train_ds.map(lambda x, y: (preprocess_input(x), y)).cache().shuffle(1000).prefetch(AUTOTUNE)
val_ds = val_ds.map(lambda x, y: (preprocess_input(x), y)).cache().prefetch(AUTOTUNE)
test_ds = test_ds.map(lambda x, y: (preprocess_input(x), y)).cache().prefetch(AUTOTUNE)

# ============================================================================
# SECTION 5: MODEL ARCHITECTURE (Transfer Learning)
# ============================================================================

# Load pre-trained MobileNetV2 base model (trained on ImageNet - 1.4M images)
# include_top=False: Remove original classification layer (ImageNet has 1000 classes)
# weights='imagenet': Use pre-trained weights from ImageNet dataset
base_model = MobileNetV2(
    input_shape=img_size + (3,),  # Input: 224x224x3 (RGB images)
    include_top=False,  # Exclude top classification layer
    weights='imagenet'  # Use ImageNet pre-trained weights
)
base_model.trainable = False  # Freeze base model weights (only train custom layers)

# Build complete model with custom classification head
model = Sequential([
    base_model,  # MobileNetV2 feature extractor (frozen)
    GlobalAveragePooling2D(),  # Reduces spatial dimensions to 1D feature vector
    Dropout(0.3),  # Randomly drop 30% of connections to prevent overfitting
    Dense(num_classes, activation='softmax')  # Final classification layer (15 Sarawak species)
])

# Compile model with optimizer, loss function, and metrics
model.compile(
    optimizer=Adam(learning_rate=0.0005),  # Adam optimizer with learning rate 0.0005
    loss='sparse_categorical_crossentropy',  # Loss function for multi-class classification
    metrics=['accuracy']  # Track accuracy during training
)

# ============================================================================
# SECTION 6: MODEL TRAINING
# ============================================================================

# Train the model on training data, validate on validation data
# history object contains training metrics for each epoch
history = model.fit(
    train_ds,  # Training dataset
    validation_data=val_ds,  # Validation dataset (monitors overfitting)
    epochs=epochs  # Train for 20 complete passes through data
)

# ============================================================================
# SECTION 7: MODEL EVALUATION
# ============================================================================

# Evaluate final model performance on test dataset (never seen during training)
test_loss, test_acc = model.evaluate(test_ds)  # Calculate loss and accuracy
print(f"\nTest Accuracy: {test_acc:.4f}")  # Display final accuracy (typically 80-95%)

# ============================================================================
# SECTION 8: PREDICTIONS & CONFIDENCE SCORES
# ============================================================================

# Get true labels from test dataset
y_true = np.concatenate([y for x, y in test_ds], axis=0)  # Ground truth labels (correct species)

# Get model predictions (probability distribution for each class)
y_pred_probs = model.predict(test_ds)  # Returns probabilities for all 15 species

# Get predicted class (species with highest probability)
y_pred = np.argmax(y_pred_probs, axis=1)  # Index of highest probability

# Display sample predictions with confidence scores
print("\nSample Predictions with Confidence:")
for i in range(min(5, len(y_true))):  # Show first 5 predictions
    true_label = class_names[y_true[i]]  # Actual species name
    pred_label = class_names[y_pred[i]]  # Predicted species name
    confidence = np.max(y_pred_probs[i]) * 100  # Confidence percentage (0-100%)
    print(f"Image {i+1}: True = {true_label}, Pred = {pred_label}, Confidence = {confidence:.2f}%")

# ============================================================================
# SECTION 9: VISUALIZATION - TRAINING HISTORY
# ============================================================================

# Create figure with 2 subplots (accuracy and loss over epochs)
plt.figure(figsize=(12, 5))  # 12 inches wide, 5 inches tall

# Plot 1: Accuracy over epochs
plt.subplot(1, 2, 1)  # 1 row, 2 columns, plot 1
plt.plot(history.history['accuracy'], label='Train Accuracy')  # Training accuracy per epoch
plt.plot(history.history['val_accuracy'], label='Validation Accuracy')  # Validation accuracy per epoch
plt.title('Model Accuracy')  # Plot title
plt.xlabel('Epoch')  # X-axis label (training iterations)
plt.ylabel('Accuracy')  # Y-axis label (0.0 to 1.0)
plt.legend()  # Show legend
plt.grid(True)  # Add grid for readability

# Plot 2: Loss over epochs
plt.subplot(1, 2, 2)  # 1 row, 2 columns, plot 2
plt.plot(history.history['loss'], label='Train Loss')  # Training loss per epoch (should decrease)
plt.plot(history.history['val_loss'], label='Validation Loss')  # Validation loss per epoch
plt.title('Model Loss')  # Plot title
plt.xlabel('Epoch')  # X-axis label
plt.ylabel('Loss')  # Y-axis label (lower is better)
plt.legend()  # Show legend
plt.grid(True)  # Add grid

plt.tight_layout()  # Adjust spacing between subplots
plt.show()  # Display the plots

# ============================================================================
# SECTION 10: CONFUSION MATRIX
# ============================================================================

# Generate confusion matrix (shows which species are confused with each other)
cm = confusion_matrix(y_true, y_pred)  # Rows = true labels, Columns = predicted labels

# Create heatmap visualization of confusion matrix
plt.figure(figsize=(10, 8))  # Large figure for readability
sns.heatmap(
    cm,  # Confusion matrix data
    annot=True,  # Show numbers in each cell
    fmt="d",  # Format as integers
    cmap="Blues",  # Color scheme (light to dark blue)
    xticklabels=class_names,  # X-axis labels (predicted species)
    yticklabels=class_names  # Y-axis labels (true species)
)
plt.xlabel("Predicted Label")  # X-axis title
plt.ylabel("True Label")  # Y-axis title
plt.title("Confusion Matrix")  # Plot title
plt.tight_layout()  # Adjust layout

# Save confusion matrix to file
cm_path = os.path.join(save_dir, "confusion_matrix.png")  # Output file path
plt.savefig(cm_path)  # Save as PNG image
plt.show()  # Display the matrix
print(f"Confusion matrix saved to: {cm_path}")

# ============================================================================
# SECTION 11: CLASSIFICATION REPORT
# ============================================================================

# Generate detailed classification report (precision, recall, F1-score per class)
report = classification_report(
    y_true,  # True labels
    y_pred,  # Predicted labels
    target_names=class_names  # Species names for report
)
print("\nClassification Report:\n", report)

# Save classification report to text file
report_path = os.path.join(save_dir, "classification_report.txt")  # Output file path
with open(report_path, "w") as f:  # Open file for writing
    f.write(report)  # Write report to file
print(f"Classification report saved to: {report_path}")

# ============================================================================
# SECTION 12: MODEL SAVING
# ============================================================================

# Save the trained model to disk for deployment
model_path = os.path.join(save_dir, "mobilenetv2_plant_model.h5")  # Output model path
model.save(model_path)  # Save in HDF5 format (.h5 or .keras)

print(f"\nModel saved at: {model_path}")
print("\n" + "="*60)
print("    TRAINING COMPLETE!")
print(f"   Final Accuracy: {test_acc:.2%}")
print(f"   Model: {model_path}")
print(f"   Results: {save_dir}/")
print("="*60)
