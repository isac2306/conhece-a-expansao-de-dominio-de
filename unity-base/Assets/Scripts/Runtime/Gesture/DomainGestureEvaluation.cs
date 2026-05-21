using UnityEngine;

namespace UnlimitedVoid.UnityBase.Gesture
{
    public readonly struct DomainGestureMetrics
    {
        public DomainGestureMetrics(
            float handScale,
            Vector2 centerNormalized,
            float indexExtension,
            float middleExtension,
            float ringCurl,
            float pinkyCurl,
            float tipGap,
            float angle,
            bool crossing,
            bool orderFlip)
        {
            HandScale = handScale;
            CenterNormalized = centerNormalized;
            IndexExtension = indexExtension;
            MiddleExtension = middleExtension;
            RingCurl = ringCurl;
            PinkyCurl = pinkyCurl;
            TipGap = tipGap;
            Angle = angle;
            Crossing = crossing;
            OrderFlip = orderFlip;
        }

        public float HandScale { get; }
        public Vector2 CenterNormalized { get; }
        public float IndexExtension { get; }
        public float MiddleExtension { get; }
        public float RingCurl { get; }
        public float PinkyCurl { get; }
        public float TipGap { get; }
        public float Angle { get; }
        public bool Crossing { get; }
        public bool OrderFlip { get; }
    }

    public readonly struct DomainGestureEvaluation
    {
        public DomainGestureEvaluation(
            DomainGestureMetrics metrics,
            float overallScore,
            float framingScore,
            float indexScore,
            float middleScore,
            float closeScore,
            float crossScore,
            float ringScore,
            float pinkyScore)
        {
            Metrics = metrics;
            OverallScore = overallScore;
            FramingScore = framingScore;
            IndexScore = indexScore;
            MiddleScore = middleScore;
            CloseScore = closeScore;
            CrossScore = crossScore;
            RingScore = ringScore;
            PinkyScore = pinkyScore;
        }

        public DomainGestureMetrics Metrics { get; }
        public float OverallScore { get; }
        public float FramingScore { get; }
        public float IndexScore { get; }
        public float MiddleScore { get; }
        public float CloseScore { get; }
        public float CrossScore { get; }
        public float RingScore { get; }
        public float PinkyScore { get; }
    }
}
