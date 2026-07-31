/// Helpers shared by the bundled benchmark stand-ins.
///
/// These benchmarks are DEMONSTRATION CIRCUITS, not reference implementations
/// of the algorithms they are named after. Their hyperparameters genuinely size
/// the circuit the estimator traces — changing Bit Size or Lattice N₁ changes
/// the estimate — but their absolute numbers are not calibrated against
/// published Shor / Grover / Ekerå-Håstad resource counts. See
/// docs/features-and-fields.md § Benchmarks.
namespace Common {
    import Std.Math.*;
    import Std.Convert.*;

    /// Rotation-window width for the approximate inverse QFT below.
    ///
    /// The exact inverse QFT applies every pairwise rotation, which is O(n²) and
    /// makes a 2048-bit register untraceable in any usable time. Rotations
    /// between distant qubits contribute below the achievable precision anyway,
    /// so the standard approximation drops them past a window of about
    /// log2(n) + 2 — the same choice real resource estimates make.
    ///
    /// Reference: Coppersmith, "An approximate Fourier transform useful in
    /// quantum factoring" (arXiv:quant-ph/0201067).
    function RotationWindow(n : Int) : Int {
        if n <= 4 {
            return n;
        }
        return Ceiling(Lg(IntAsDouble(n))) + 2;
    }

    /// Approximate inverse QFT over `qs`, keeping rotations inside the window.
    operation ApplyApproximateInverseQft(qs : Qubit[]) : Unit {
        let n = Length(qs);
        let window = RotationWindow(n);
        for i in 0..n - 1 {
            for j in MaxI(0, i - window)..i - 1 {
                Controlled R1Frac([qs[j]], (1, i - j + 1, qs[i]));
            }
            H(qs[i]);
        }
    }
}
