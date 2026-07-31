/// Grover's search stand-in, sized by Search Qubits.
/// See Common.qs for what "stand-in" means here.
namespace GroversSearch {
    import Std.Math.*;
    import Std.Convert.*;

    operation Oracle(qs : Qubit[], target : Qubit) : Unit is Adj + Ctl {
        Controlled X(qs, target);
    }

    operation Diffuser(qs : Qubit[]) : Unit {
        ApplyToEach(H, qs);
        ApplyToEach(X, qs);
        if Length(qs) > 1 {
            Controlled Z(qs[1...], qs[0]);
        } else {
            Z(qs[0]);
        }
        ApplyToEach(X, qs);
        ApplyToEach(H, qs);
    }

    /// The optimal iteration count for a single marked item in a space of
    /// 2^searchQubits: round(π/4 · √(2^n)). This is the "Iterations" the field
    /// spec describes as "computed from Search Qubits upon estimation" — it is
    /// derived here rather than passed in, so it can never disagree with the
    /// register width. Computed in floating point so a wide register does not
    /// overflow a 64-bit `2^n`.
    function GroverIterations(searchQubits : Int) : Int {
        let amplitude = 2.0^(IntAsDouble(searchQubits) / 2.0);
        return MaxI(1, Round(PI() / 4.0 * amplitude));
    }

    operation Run(searchQubits : Int) : Result[] {
        let iterations = GroverIterations(searchQubits);
        use qs = Qubit[searchQubits];
        use target = Qubit();
        ApplyToEach(H, qs);
        X(target);
        H(target);

        for _ in 1..iterations {
            Oracle(qs, target);
            Diffuser(qs);
        }

        let results = MResetEachZ(qs);
        Reset(target);
        return results;
    }
}
