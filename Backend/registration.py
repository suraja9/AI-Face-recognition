# registration.py

import tkinter as tk
from tkinter import ttk, messagebox, Toplevel, Label
import threading
import cv2
import os
import face_recognition
import numpy as np
import shutil
from PIL import Image, ImageTk
import time
from firebase_integration import save_face_encoding_to_firestore, check_duplicate_entry
from config import CAPTURE_DELAY, MIN_CAPTURE_DELAY, ADJUSTMENT_FACTOR

# Constants
IMAGE_COUNT = 200
CAPTURE_DELAY = 0.1
TEMP_DIR = "temp_images"

# Ensure temporary directory exists
try:
    if not os.path.exists(TEMP_DIR):
        os.makedirs(TEMP_DIR)
except PermissionError:
    print("Error: Unable to create temporary directory due to insufficient permissions.")
    raise
except Exception as e:
    print(f"Unexpected error while creating temporary directory: {e}")
    raise

# Course data structure - (course name, duration in years)
COURSES = {
    "B.Tech in Civil Engineering": 4,
    "B.Tech in Computer Science and Engineering": 4,
    "B.Tech in Electronics and Communication Engineering": 4,
    "B.Tech in Mechanical Engineering": 4,
    "B.Tech in Electrical Engineering": 4,
    "M.Tech in Structural Engineering": 2,
    "M.Tech in Computer Science and Engineering": 2,
    "Bachelor Of Computer Application": 3,
    "B.Sc. in Physics": 4,
    "B.Sc. in Chemistry": 4,
    "B.Sc. in Mathematics": 4,
    "M.Sc. in Physics": 2,
    "M.Sc. in Chemistry": 2,
    "M.Sc. in Mathematics": 2,
    "Bachelor Of Business Administration": 4
}


def update_semester_options(*args):
    """Update semester dropdown based on selected course"""
    selected_course = course_var.get()
    
    # Clear current semester options
    semester_dropdown['values'] = ()
    semester_var.set("Select Semester")
    
    if selected_course != "Select Course":
        # Get course duration and create semester list
        years = COURSES[selected_course]
        semesters = [f"{i}{'st' if i == 1 else 'nd' if i == 2 else 'rd' if i == 3 else 'th'} Semester" 
                    for i in range(1, years * 2 + 1)]
        
        # Update semester dropdown
        semester_dropdown['values'] = semesters
        semester_dropdown['state'] = 'readonly'
    else:
        semester_dropdown['state'] = 'disabled'

def compute_average_encoding(face_encodings):
    """Compute the average encoding from a list of face encodings."""
    if not face_encodings:
        raise ValueError("No face encodings provided for averaging.")
    return [sum(encoding) / len(face_encodings) for encoding in zip(*face_encodings)]

def show_gif_and_proceed(gif_path, on_close_callback):
    """Display a GIF and proceed with the callback after 5 seconds."""
    def update_frame():
        nonlocal frame_idx
        try:
            gif.seek(frame_idx)
            frame_image = gif.copy()
            tk_image = ImageTk.PhotoImage(frame_image)
            gif_label.config(image=tk_image)
            gif_label.image = tk_image
            frame_idx = (frame_idx + 1) % gif.n_frames
            gif_window.after(gif.info.get("duration", 100), update_frame)
        except Exception as e:
            print(f"Error updating GIF frame: {e}")

    def close_after_some_time():
        gif_window.destroy()
        on_close_callback()

    try:
        gif = Image.open(gif_path)
    except FileNotFoundError:
        messagebox.showerror("Error", f"GIF file not found: {gif_path}")
        return
    except Exception as e:
        messagebox.showerror("Error", f"Failed to open GIF: {e}")
        return

    # Calculate the total duration of the GIF
    total_duration = sum(gif.info.get("duration", 100) for _ in range(gif.n_frames))

    # Display GIF in a new window
    gif_window = Toplevel()
    gif_window.title("How to Register")
    gif_window.geometry("800x600")

    gif_label = Label(gif_window)
    gif_label.pack(expand=True)

    frame_idx = 0
    gif_window.after(0, update_frame)
    gif_window.after(6700, close_after_some_time)
    gif_window.mainloop()

def capture_images(name, progress_label):
    """Capture images from the webcam."""
    cap = cv2.VideoCapture(0)
    count = 0
    dynamic_delay = CAPTURE_DELAY

    try:
        while count < IMAGE_COUNT:
            start_time = time.time()

            ret, frame = cap.read()
            if not ret:
                raise RuntimeError("Failed to capture frame from camera.")
            
            instruction_text = "Move your head left and right."
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.8
            color = (255, 0, 0)
            thickness = 2

            text_size, _ = cv2.getTextSize(instruction_text, font, font_scale, thickness)
            text_x = (frame.shape[1] - text_size[0]) // 2
            text_y = 30

            cv2.putText(frame, instruction_text, (text_x, text_y), font, font_scale, color, thickness, cv2.LINE_AA)
            cv2.imshow("Registering Face", frame)

            img_path = os.path.join(TEMP_DIR, f"{name}_{count}.jpg")
            cv2.imwrite(img_path, frame)
            count += 1

            progress_label.config(text=f"Captured Image {count}/{IMAGE_COUNT}")
            progress_label.update()

            end_time = time.time()
            processing_time = end_time - start_time

            dynamic_delay = max(MIN_CAPTURE_DELAY, dynamic_delay + (processing_time - dynamic_delay) * ADJUSTMENT_FACTOR)

            if cv2.waitKey(int(dynamic_delay * 1000)) & 0xFF == ord('q'):
                break

    except Exception as e:
        print(f"Error during image capture: {e}")
    finally:
        cap.release()
        cv2.destroyAllWindows()

def process_and_upload_images(name, course, semester, roll_number, progress_label):
    """Process captured images and upload to Firestore."""
    try:
        face_encodings = []
        image_files = os.listdir(TEMP_DIR)
        total_images = len(image_files)
        uploaded_count = 0

        for img_name in image_files:
            img_path = os.path.join(TEMP_DIR, img_name)
            image = face_recognition.load_image_file(img_path)
            encodings = face_recognition.face_encodings(image)

            if encodings:
                face_encodings.append(encodings[0])
            
            uploaded_count += 1
            progress_label.config(text=f"Processing Images... ({uploaded_count}/{total_images})")
            progress_label.update()

        if not face_encodings:
            progress_label.config(text="No faces detected. Upload aborted.")
            return

        average_encoding = compute_average_encoding(face_encodings)
        
        progress_label.config(text="Uploading Encodings...")
        save_face_encoding_to_firestore(name, np.array(average_encoding), course, semester, roll_number)

        shutil.rmtree(TEMP_DIR)
        os.makedirs(TEMP_DIR)

        progress_label.config(text="Upload Complete!")
        print("Upload successful and temporary files deleted.")
    except Exception as e:
        print(f"Error during processing and uploading: {e}")
        progress_label.config(text=f"Error: {e}")

def set_details():
    """Validate and set user details."""
    name = name_entry.get().strip()
    course = course_var.get()
    semester = semester_var.get()
    roll_number = roll_entry.get().strip()

    # Validate input fields
    if not name:
        messagebox.showerror("Input Error", "Please enter your name!")
        return
    if course == "Select Course":
        messagebox.showerror("Input Error", "Please select a course!")
        return
    if semester == "Select Semester":
        messagebox.showerror("Input Error", "Please select a semester!")
        return
    if not roll_number:
        messagebox.showerror("Input Error", "Please enter your roll number!")
        return

    # Check for duplicates
    if check_duplicate_entry(name, course, semester, roll_number):
        messagebox.showerror("Duplicate Entry", "An entry with these details already exists.")
        return

    # Store values globally for use in registration
    global registration_details
    registration_details = {
        'name': name,
        'course': course,
        'semester': semester,
        'roll_number': roll_number
    }

    # Enable the 'Start Registration' button
    start_button.config(state="normal")
    messagebox.showinfo("Details Set", "Details have been saved. You may start registration now.")

def start_registration():
    """Start the registration process."""
    gif_path = "instruction.gif"

    def proceed_to_registration():
        root.withdraw()  # Hide the main window
        try:
            threading.Thread(
                target=perform_registration,
                args=(
                    registration_details['name'],
                    registration_details['course'],
                    registration_details['semester'],
                    registration_details['roll_number']
                ),
                daemon=True
            ).start()
        except Exception as e:
            print(f"Thread error: {e}")
            messagebox.showerror("Thread Error", f"An error occurred while starting the thread:\n{str(e)}")

    show_gif_and_proceed(gif_path, proceed_to_registration)

def perform_registration(name, course, semester, roll_number):
    """Perform the actual registration process."""
    try:
        # Show progress window for capturing images
        progress_window = Toplevel()
        progress_window.title("Image Capture Progress")
        progress_window.geometry("400x100")

        capture_label = Label(progress_window, text="Capturing Images...", font=("Arial", 12))
        capture_label.pack(pady=20)

        capture_images(name, capture_label)
        progress_window.destroy()

        # Show progress window for uploading encodings
        upload_window = Toplevel()
        upload_window.title("Uploading Encodings")
        upload_window.geometry("400x100")

        upload_label = Label(upload_window, text="Processing Images...", font=("Arial", 12))
        upload_label.pack(pady=20)

        process_and_upload_images(name, course, semester, roll_number, upload_label)
        upload_window.destroy()

        messagebox.showinfo("Success", f"Face encoding uploaded successfully for {name}.")
    except Exception as e:
        print(f"An error occurred in perform_registration: {e}")
        messagebox.showerror("Error", f"An error occurred during registration:\n{str(e)}")

# Create the main registration window
root = tk.Tk()
root.title("Face Registration")

# Calculate the width needed for the longest course name
longest_course = max(COURSES.keys(), key=len)
text_width = len(longest_course) + 5  # Add some padding

# Set window size based on the longest course name
window_width = max(600, text_width * 10)  # Minimum width of 600 pixels
root.geometry(f"{window_width}x400")
root.resizable(False, False)

# Create a main frame with padding
main_frame = ttk.Frame(root, padding="20")
main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

# Style configuration
style = ttk.Style()
style.configure('TLabel', font=('Arial', 12))
style.configure('TEntry', font=('Arial', 12))
style.configure('TButton', font=('Arial', 12))

# Configure columns to expand properly
main_frame.columnconfigure(1, weight=1)

# Name Entry
ttk.Label(main_frame, text="Enter Name:").grid(row=0, column=0, padx=10, pady=15, sticky="w")
name_entry = ttk.Entry(main_frame, width=40)  # Increased width
name_entry.grid(row=0, column=1, padx=10, pady=15, sticky="ew")

# Course Dropdown
ttk.Label(main_frame, text="Select Course:").grid(row=1, column=0, padx=10, pady=15, sticky="w")
course_var = tk.StringVar()
course_var.set("Select Course")
course_dropdown = ttk.Combobox(main_frame, textvariable=course_var, width=50, state="readonly")  # Increased width
course_dropdown['values'] = ["Select Course"] + list(COURSES.keys())
course_dropdown.grid(row=1, column=1, padx=10, pady=15, sticky="ew")

# Semester Dropdown
ttk.Label(main_frame, text="Select Semester:").grid(row=2, column=0, padx=10, pady=15, sticky="w")
semester_var = tk.StringVar()
semester_var.set("Select Semester")
semester_dropdown = ttk.Combobox(main_frame, textvariable=semester_var, width=50, state="disabled")  # Increased width
semester_dropdown.grid(row=2, column=1, padx=10, pady=15, sticky="ew")

# Roll Number Entry
ttk.Label(main_frame, text="Enter Roll Number:").grid(row=3, column=0, padx=10, pady=15, sticky="w")
roll_entry = ttk.Entry(main_frame, width=40)  # Increased width
roll_entry.grid(row=3, column=1, padx=10, pady=15, sticky="ew")

# Button Frame
button_frame = ttk.Frame(main_frame)
button_frame.grid(row=4, column=0, columnspan=2, pady=30)

# Buttons
set_button = ttk.Button(button_frame, text="Set Details", command=set_details, width=25)  # Increased width
set_button.grid(row=0, column=0, padx=10)

start_button = ttk.Button(button_frame, text="Start Registration", command=start_registration, width=25, state="disabled")  # Increased width
start_button.grid(row=0, column=1, padx=10)

# Bind course selection to semester update
course_var.trace('w', update_semester_options)

# Initialize registration details dictionary
registration_details = {}

# Center all dropdown text
style.configure("TCombobox", justify="center")

# Function to adjust dropdown width based on content
def adjust_dropdown_width(event):
    width = max([len(str(x)) for x in course_dropdown['values']])
    width = max(width, 50)  # Minimum width of 50 characters
    course_dropdown.configure(width=width)
    semester_dropdown.configure(width=width)

# Bind the adjustment function to dropdown opening
course_dropdown.bind('<Configure>', adjust_dropdown_width)

# Run the main application loop
if __name__ == "__main__":
    root.mainloop()