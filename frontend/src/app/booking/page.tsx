'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface TimeSlot {
  time: string;
  available: boolean;
  spots_left: number;
}

interface DaySlot {
  date: string;
  day_name: string;
  time_slots: TimeSlot[];
}

interface MaintenanceStatus {
  maintenance_mode: boolean;
  message: string | null;
  status: string;
}

export default function BookingPage() {
  const [maintenanceStatus, setMaintenanceStatus] = useState<MaintenanceStatus | null>(null);
  const [slots, setSlots] = useState<DaySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const router = useRouter();

  // Check maintenance status first
  useEffect(() => {
    checkMaintenanceStatus();
  }, []);

  const checkMaintenanceStatus = async () => {
    try {
      const response = await fetch('/api/maintenance/');
      const data = await response.json();
      setMaintenanceStatus(data);
      
      if (data.maintenance_mode) {
        setLoading(false);
        return; // Don't load slots if in maintenance
      }
      
      // Only load slots if not in maintenance
      loadSlots();
    } catch (error) {
      console.error('Error checking maintenance status:', error);
      setLoading(false);
    }
  };

  const loadSlots = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/booking/slots/', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 503) {
        const data = await response.json();
        setMaintenanceStatus({
          maintenance_mode: true,
          message: data.message,
          status: 'maintenance'
        });
        setLoading(false);
        return;
      }

      const data = await response.json();
      setSlots(data.slots || []);
    } catch (error) {
      console.error('Error loading slots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBooking = async () => {
    if (!selectedDate || !selectedTime) {
      alert('Please select both date and time');
      return;
    }

    setBookingLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/booking/book/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: selectedDate,
          time: selectedTime,
        }),
      });

      if (response.status === 503) {
        const data = await response.json();
        alert(data.message);
        return;
      }

      const data = await response.json();
      
      if (response.ok) {
        alert('Booking successful! Booking ID: ' + data.booking.booking_id);
        // Reload slots to update availability
        loadSlots();
        setSelectedDate('');
        setSelectedTime('');
      } else {
        alert(data.message || 'Booking failed');
      }
    } catch (error) {
      console.error('Error booking slot:', error);
      alert('Booking failed. Please try again.');
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show maintenance screen if maintenance mode is active
  if (maintenanceStatus?.maintenance_mode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="mb-6">
            <svg className="mx-auto h-12 w-12 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Under Maintenance</h2>
          <p className="text-gray-600 mb-6">
            {maintenanceStatus.message || 'System is currently under maintenance. Please try again later.'}
          </p>
          <button
            onClick={checkMaintenanceStatus}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Check Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">Book Your Spot</h1>
        
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-6">Select Date & Time</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {slots.map((day) => (
              <div key={day.date} className="border rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-2">
                  {day.day_name} - {day.date}
                </h3>
                <div className="space-y-2">
                  {day.time_slots.map((slot) => (
                    <button
                      key={slot.time}
                      onClick={() => {
                        setSelectedDate(day.date);
                        setSelectedTime(slot.time);
                      }}
                      disabled={!slot.available}
                      className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                        selectedDate === day.date && selectedTime === slot.time
                          ? 'bg-blue-600 text-white border-blue-600'
                          : slot.available
                          ? 'bg-white hover:bg-gray-50 border-gray-300'
                          : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span>{slot.time}</span>
                        {slot.available ? (
                          <span className="text-xs">{slot.spots_left} spots left</span>
                        ) : (
                          <span className="text-xs">Full</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {selectedDate && selectedTime && (
            <div className="border-t pt-6">
              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                <h3 className="font-semibold mb-2">Selected Slot:</h3>
                <p className="text-gray-700">
                  Date: {selectedDate}<br />
                  Time: {selectedTime}
                </p>
              </div>
              
              <button
                onClick={handleBooking}
                disabled={bookingLoading}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {bookingLoading ? 'Booking...' : 'Book Slot'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
