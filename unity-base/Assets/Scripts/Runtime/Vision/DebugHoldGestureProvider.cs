using UnityEngine;

namespace UnlimitedVoid.UnityBase.Vision
{
    public sealed class DebugHoldGestureProvider : MonoBehaviour, IHandLandmarkProvider
    {
        [SerializeField] private KeyCode validGestureKey = KeyCode.G;
        [SerializeField] private KeyCode weakGestureKey = KeyCode.H;
        [SerializeField] private bool followMouse = true;
        [SerializeField] private Vector2 centerNormalized = new Vector2(0.5f, 0.52f);
        [SerializeField] private float normalizedSize = 0.22f;
        [SerializeField] private float idleSway = 0.015f;

        private readonly HandLandmarkFrame _frame = new HandLandmarkFrame();

        public bool TryGetFrame(out HandLandmarkFrame frame)
        {
            if (!Input.GetKey(validGestureKey) && !Input.GetKey(weakGestureKey))
            {
                frame = null;
                return false;
            }

            var center = followMouse
                ? new Vector2(
                    Mathf.Clamp01(Input.mousePosition.x / Mathf.Max(1f, Screen.width)),
                    Mathf.Clamp01(Input.mousePosition.y / Mathf.Max(1f, Screen.height)))
                : centerNormalized;

            var sway = Mathf.Sin(Time.time * 3.2f) * idleSway;
            var size = normalizedSize;
            var valid = Input.GetKey(validGestureKey);

            SetValidPose(center + new Vector2(sway, 0f), size, valid ? 1f : 0.65f);
            _frame.TrackingConfidence = valid ? 1f : 0.62f;
            frame = _frame;
            return true;
        }

        private void SetValidPose(Vector2 center, float size, float quality)
        {
            var wrist = center + new Vector2(0f, 0.48f * size);
            var thumbMcp = center + new Vector2(-0.28f * size, 0.20f * size);
            var thumbPip = center + new Vector2(-0.42f * size, 0.08f * size);
            var thumbDip = center + new Vector2(-0.53f * size, 0.02f * size);
            var thumbTip = center + new Vector2(-0.62f * size, 0.04f * size);

            var indexMcp = center + new Vector2(-0.18f * size, 0.11f * size);
            var indexPip = center + new Vector2(-0.03f * size, -0.12f * size);
            var indexDip = center + new Vector2(0.05f * size, -0.31f * size);
            var indexTip = center + new Vector2((0.10f + 0.05f * (1f - quality)) * size, (-0.51f + 0.08f * (1f - quality)) * size);

            var middleMcp = center + new Vector2(0.13f * size, 0.10f * size);
            var middlePip = center + new Vector2(0.09f * size, -0.11f * size);
            var middleDip = center + new Vector2(0.00f * size, -0.30f * size);
            var middleTip = center + new Vector2((-0.02f - 0.14f * (1f - quality)) * size, (-0.49f + 0.09f * (1f - quality)) * size);

            var ringMcp = center + new Vector2(0.26f * size, 0.14f * size);
            var ringPip = center + new Vector2(0.23f * size, 0.00f * size);
            var ringDip = center + new Vector2(0.20f * size, 0.10f * size);
            var ringTip = center + new Vector2(0.17f * size, 0.19f * size);

            var pinkyMcp = center + new Vector2(0.40f * size, 0.18f * size);
            var pinkyPip = center + new Vector2(0.37f * size, 0.09f * size);
            var pinkyDip = center + new Vector2(0.35f * size, 0.15f * size);
            var pinkyTip = center + new Vector2(0.33f * size, 0.23f * size);

            _frame[0] = wrist;
            _frame[1] = thumbMcp;
            _frame[2] = thumbPip;
            _frame[3] = thumbDip;
            _frame[4] = thumbTip;
            _frame[5] = indexMcp;
            _frame[6] = indexPip;
            _frame[7] = indexDip;
            _frame[8] = indexTip;
            _frame[9] = middleMcp;
            _frame[10] = middlePip;
            _frame[11] = middleDip;
            _frame[12] = middleTip;
            _frame[13] = ringMcp;
            _frame[14] = ringPip;
            _frame[15] = ringDip;
            _frame[16] = ringTip;
            _frame[17] = pinkyMcp;
            _frame[18] = pinkyPip;
            _frame[19] = pinkyDip;
            _frame[20] = pinkyTip;
        }
    }
}
