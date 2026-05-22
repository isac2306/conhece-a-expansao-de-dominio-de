package com.isac.unlimitedvoid.bridge;

import java.util.concurrent.atomic.AtomicReference;

public final class HandLandmarkerBridge {
    private final AtomicReference<float[]> latestFrame = new AtomicReference<>();
    private volatile boolean initialized;

    private HandLandmarkerBridge() {
    }

    public static HandLandmarkerBridge create() {
        return new HandLandmarkerBridge();
    }

    public void initialize() {
        initialized = true;
    }

    public boolean hasLatestFrame() {
        return initialized && latestFrame.get() != null;
    }

    public float[] consumeLatestFrame() {
        return latestFrame.getAndSet(null);
    }

    public void updateLatestFrame(float[] values) {
        latestFrame.set(values);
    }

    public void clearLatestFrame() {
        latestFrame.set(null);
    }

    public void dispose() {
        clearLatestFrame();
        initialized = false;
    }
}
