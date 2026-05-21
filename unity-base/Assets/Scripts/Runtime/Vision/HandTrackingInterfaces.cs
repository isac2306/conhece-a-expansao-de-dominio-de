using UnityEngine;

namespace UnlimitedVoid.UnityBase.Vision
{
    public sealed class HandLandmarkFrame
    {
        public const int LandmarkCount = 21;

        private readonly Vector2[] _points = new Vector2[LandmarkCount];

        public float TrackingConfidence { get; set; } = 1f;

        public Vector2 this[int index]
        {
            get => _points[index];
            set => _points[index] = value;
        }

        public Vector2[] Points => _points;

        public void CopyFrom(HandLandmarkFrame other)
        {
            TrackingConfidence = other.TrackingConfidence;
            for (int index = 0; index < LandmarkCount; index += 1)
            {
                _points[index] = other._points[index];
            }
        }
    }

    public interface IHandLandmarkProvider
    {
        bool TryGetFrame(out HandLandmarkFrame frame);
    }

    public interface IPersonMaskProvider
    {
        bool TryGetMask(out Texture maskTexture);
    }
}
