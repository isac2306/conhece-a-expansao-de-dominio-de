Shader "UnlimitedVoid/Backdrop"
{
    Properties
    {
        _TintA ("Tint A", Color) = (0.03, 0.09, 0.16, 1)
        _TintB ("Tint B", Color) = (0.31, 0.72, 1.00, 1)
        _TintC ("Tint C", Color) = (1.00, 0.93, 0.72, 1)
        _Activation ("Activation", Range(0, 1)) = 0
        _TimeOffset ("Time Offset", Float) = 0
        _DomainCenter ("Domain Center", Vector) = (0.5, 0.45, 0, 0)
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        Cull Off
        ZWrite On

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 vertex : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            fixed4 _TintA;
            fixed4 _TintB;
            fixed4 _TintC;
            float _Activation;
            float _TimeOffset;
            float4 _DomainCenter;

            v2f vert(appdata v)
            {
                v2f o;
                o.vertex = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                return o;
            }

            float hash21(float2 p)
            {
                p = frac(p * float2(123.34, 345.45));
                p += dot(p, p + 34.345);
                return frac(p.x * p.y);
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 uv = i.uv;
                float2 centered = uv - _DomainCenter.xy;
                centered.x *= 1.7777;

                float radius = length(centered);
                float angle = atan2(centered.y, centered.x);
                float sweep = _TimeOffset * 0.8;

                float starField = step(0.992, hash21(floor(uv * 140 + sweep * 12)));
                float rings = 0.5 + 0.5 * sin(radius * 82 - _TimeOffset * 7);
                float halo = smoothstep(0.58, 0.02, radius);
                float flash = smoothstep(0.42, 0.0, radius) * _Activation;

                float perspectiveY = max(0.001, uv.y + 0.18);
                float gridX = abs(frac((uv.x - 0.5) * 18 / perspectiveY + sweep * 0.15) - 0.5);
                float gridY = abs(frac(uv.y * 22 + sweep * 0.1) - 0.5);
                float grid = smoothstep(0.05, 0.0, min(gridX, gridY));

                fixed3 baseColor = lerp(_TintA.rgb, _TintB.rgb, saturate(0.5 + 0.5 * cos(angle * 3 + sweep)));
                baseColor += _TintC.rgb * rings * _Activation * 0.28;
                baseColor += _TintB.rgb * halo * 0.55;
                baseColor += grid * (_TintB.rgb * 0.18 + _TintC.rgb * 0.06);
                baseColor += starField * 0.35;
                baseColor += flash * _TintC.rgb;

                return fixed4(saturate(baseColor), 1);
            }
            ENDCG
        }
    }
}
