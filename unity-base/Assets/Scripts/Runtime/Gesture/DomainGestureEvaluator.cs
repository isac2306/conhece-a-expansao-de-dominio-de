using UnityEngine;
using UnlimitedVoid.UnityBase.Vision;

namespace UnlimitedVoid.UnityBase.Gesture
{
    public static class DomainGestureEvaluator
    {
        public static DomainGestureEvaluation Evaluate(HandLandmarkFrame frame, DomainGestureProfile profile)
        {
            var metrics = ComputeMetrics(frame);
            var indexScore = NormalizeScore(
                metrics.IndexExtension,
                Mathf.Max(0.14f, profile.IndexExtension * 0.68f),
                Mathf.Max(0.26f, profile.IndexExtension * 1.08f));
            var middleScore = NormalizeScore(
                metrics.MiddleExtension,
                Mathf.Max(0.14f, profile.MiddleExtension * 0.68f),
                Mathf.Max(0.26f, profile.MiddleExtension * 1.08f));
            var closeScore = InvertScore(
                metrics.TipGap,
                Mathf.Max(0.30f, profile.TipGap * 1.14f),
                Mathf.Max(0.20f, profile.TipGap * 0.90f));
            var crossByAngle = ClosenessScore(
                metrics.Angle,
                Mathf.Clamp(profile.CrossAngle, 12f, 42f),
                Mathf.Max(12f, profile.CrossAngle * 0.80f));
            var crossScore = metrics.Crossing
                ? 1f
                : metrics.OrderFlip
                    ? Mathf.Max(0.72f, crossByAngle)
                    : crossByAngle * 0.30f;
            var ringScore = NormalizeScore(
                metrics.RingCurl,
                Mathf.Min(-0.05f, profile.RingCurl - 0.12f),
                Mathf.Max(0.02f, profile.RingCurl + 0.08f));
            var pinkyScore = NormalizeScore(
                metrics.PinkyCurl,
                Mathf.Min(-0.05f, profile.PinkyCurl - 0.12f),
                Mathf.Max(0.02f, profile.PinkyCurl + 0.08f));
            var framingScore = NormalizeScore(metrics.HandScale, 0.13f, 0.28f);

            var overall =
                indexScore * 0.19f +
                middleScore * 0.19f +
                closeScore * 0.20f +
                crossScore * 0.20f +
                ringScore * 0.08f +
                pinkyScore * 0.08f +
                framingScore * 0.06f;

            return new DomainGestureEvaluation(
                metrics,
                overall,
                framingScore,
                indexScore,
                middleScore,
                closeScore,
                crossScore,
                ringScore,
                pinkyScore);
        }

        private static DomainGestureMetrics ComputeMetrics(HandLandmarkFrame frame)
        {
            var wrist = frame[0];
            var indexMcp = frame[5];
            var indexPip = frame[6];
            var indexTip = frame[8];
            var middleMcp = frame[9];
            var middlePip = frame[10];
            var middleTip = frame[12];
            var ringPip = frame[14];
            var ringTip = frame[16];
            var pinkyMcp = frame[17];
            var pinkyPip = frame[18];
            var pinkyTip = frame[20];

            var handScale = Mathf.Max(Vector2.Distance(indexMcp, pinkyMcp), 0.001f);
            var indexVector = indexTip - indexPip;
            var middleVector = middleTip - middlePip;
            var tipGap = Vector2.Distance(indexTip, middleTip) / handScale;
            var angle = AngleBetween(indexVector, middleVector);
            var orderFlip = (indexTip.x - middleTip.x) * (indexMcp.x - middleMcp.x) < 0f;
            var crossing = SegmentsIntersect(indexPip, indexTip, middlePip, middleTip);
            var center = new Vector2(
                Average(wrist.x, indexMcp.x, middleMcp.x, pinkyMcp.x),
                Average(wrist.y, indexMcp.y, middleMcp.y, pinkyMcp.y));

            return new DomainGestureMetrics(
                handScale,
                center,
                (Vector2.Distance(indexTip, wrist) - Vector2.Distance(indexPip, wrist)) / handScale,
                (Vector2.Distance(middleTip, wrist) - Vector2.Distance(middlePip, wrist)) / handScale,
                (Vector2.Distance(ringPip, wrist) - Vector2.Distance(ringTip, wrist)) / handScale,
                (Vector2.Distance(pinkyPip, wrist) - Vector2.Distance(pinkyTip, wrist)) / handScale,
                tipGap,
                angle,
                crossing,
                orderFlip);
        }

        private static float NormalizeScore(float value, float min, float max)
        {
            if (max <= min)
            {
                return 0f;
            }

            return Mathf.Clamp01((value - min) / (max - min));
        }

        private static float InvertScore(float value, float idealMax, float tolerance)
        {
            if (value <= idealMax)
            {
                return 1f;
            }

            return Mathf.Clamp01(1f - (value - idealMax) / tolerance);
        }

        private static float ClosenessScore(float value, float target, float tolerance)
        {
            return Mathf.Clamp01(1f - Mathf.Abs(value - target) / tolerance);
        }

        private static float AngleBetween(Vector2 a, Vector2 b)
        {
            var denominator = a.magnitude * b.magnitude;
            if (denominator <= Mathf.Epsilon)
            {
                return 0f;
            }

            var cosine = Mathf.Clamp(Vector2.Dot(a, b) / denominator, -1f, 1f);
            return Mathf.Acos(cosine) * Mathf.Rad2Deg;
        }

        private static bool SegmentsIntersect(Vector2 p1, Vector2 q1, Vector2 p2, Vector2 q2)
        {
            var o1 = Orientation(p1, q1, p2);
            var o2 = Orientation(p1, q1, q2);
            var o3 = Orientation(p2, q2, p1);
            var o4 = Orientation(p2, q2, q1);
            const float epsilon = 0.00001f;

            if ((o1 > 0f) != (o2 > 0f) && (o3 > 0f) != (o4 > 0f))
            {
                return true;
            }

            if (Mathf.Abs(o1) < epsilon && OnSegment(p1, p2, q1)) return true;
            if (Mathf.Abs(o2) < epsilon && OnSegment(p1, q2, q1)) return true;
            if (Mathf.Abs(o3) < epsilon && OnSegment(p2, p1, q2)) return true;
            if (Mathf.Abs(o4) < epsilon && OnSegment(p2, q1, q2)) return true;

            return false;
        }

        private static float Orientation(Vector2 a, Vector2 b, Vector2 c)
        {
            return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
        }

        private static bool OnSegment(Vector2 a, Vector2 b, Vector2 c)
        {
            return
                b.x <= Mathf.Max(a.x, c.x) &&
                b.x >= Mathf.Min(a.x, c.x) &&
                b.y <= Mathf.Max(a.y, c.y) &&
                b.y >= Mathf.Min(a.y, c.y);
        }

        private static float Average(float a, float b, float c, float d)
        {
            return (a + b + c + d) * 0.25f;
        }
    }
}
